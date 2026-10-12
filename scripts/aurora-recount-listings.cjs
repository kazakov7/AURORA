#!/usr/bin/env node
'use strict';

/**
 * AURORA listing counter recount (AURORA_DEV only).
 *
 * memberProperties, memberTours, destinationProperties and destinationTours count
 * ACTIVE, not deleted listings only. Data written before that rule counted every
 * created listing, so this script recounts them from the listings themselves.
 *
 * Usage (from AURORA backend repository root):
 *   node scripts/aurora-recount-listings.cjs scan                       # read only, prints the differences
 *   node scripts/aurora-recount-listings.cjs apply --backup-confirmed   # writes only the differing counters
 *
 * Does NOT change listing statuses and does NOT touch the production database.
 * A counter that changed after the scan is left alone, so run apply again if it reports skipped rows.
 */

const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { MongoClient } = require('mongodb');

const ROOT = process.cwd();
if (!fs.existsSync(path.join(ROOT, 'apps', 'aurora-api', 'src'))) {
  console.error('Run this from the AURORA backend repository root.');
  process.exit(1);
}
for (const file of ['.env.local', '.env.development', '.env']) {
  const abs = path.join(ROOT, file);
  if (fs.existsSync(abs)) dotenv.config({ path: abs, quiet: true });
}

const DB_NAME = 'AURORA_DEV'; // Intentionally never configurable from CLI.
const mode = process.argv[2] || 'scan';
if (!['scan', 'apply'].includes(mode)) {
  console.error('Usage: node scripts/aurora-recount-listings.cjs scan|apply [--backup-confirmed]');
  process.exit(1);
}
if (mode === 'apply' && !process.argv.includes('--backup-confirmed')) {
  console.error('apply writes to AURORA_DEV. Back the database up first, then pass --backup-confirmed.');
  process.exit(1);
}
if (!process.env.MONGO_DEV) {
  console.error('MONGO_DEV not found. Set it in the AURORA backend .env (never paste credentials into chat).');
  process.exit(1);
}

// Each counter: the document holding it, and the listings it counts grouped by the owning key
const COUNTERS = [
  { collection: 'members', field: 'memberProperties', listings: 'properties', statusKey: 'propertyStatus', groupKey: 'memberId' },
  { collection: 'members', field: 'memberTours', listings: 'tours', statusKey: 'tourStatus', groupKey: 'memberId' },
  { collection: 'destinations', field: 'destinationProperties', listings: 'properties', statusKey: 'propertyStatus', groupKey: 'destinationId' },
  { collection: 'destinations', field: 'destinationTours', listings: 'tours', statusKey: 'tourStatus', groupKey: 'destinationId' },
];

async function activeCounts(db, counter) {
  const rows = await db
    .collection(counter.listings)
    .aggregate([
      { $match: { [counter.statusKey]: 'ACTIVE', deletedAt: null } },
      { $group: { _id: `$${counter.groupKey}`, count: { $sum: 1 } } },
    ])
    .toArray();
  return new Map(rows.map((row) => [String(row._id), row.count]));
}

async function differences(db, counter) {
  const expected = await activeCounts(db, counter);
  const docs = await db
    .collection(counter.collection)
    .find({}, { projection: { [counter.field]: 1 } })
    .toArray();

  const rows = [];
  for (const doc of docs) {
    const stored = doc[counter.field] ?? 0;
    const actual = expected.get(String(doc._id)) ?? 0;
    if (stored !== actual) rows.push({ _id: doc._id, stored: doc[counter.field], actual });
  }
  return rows;
}

async function main() {
  const mongo = new MongoClient(process.env.MONGO_DEV, { serverSelectionTimeoutMS: 15000 });
  await mongo.connect();
  try {
    const db = mongo.db(DB_NAME);
    console.log(`[recount] ${mode} on ${DB_NAME}`);
    let total = 0;
    let skipped = 0;

    for (const counter of COUNTERS) {
      const rows = await differences(db, counter);
      total += rows.length;
      console.log(`\n${counter.collection}.${counter.field}: ${rows.length} to fix`);
      for (const row of rows) console.log(`  ${row._id}  ${row.stored ?? 'missing'} -> ${row.actual}`);
      if (mode !== 'apply' || !rows.length) continue;

      // Matching the stored value keeps a counter the API changed after the scan from being overwritten
      const result = await db.collection(counter.collection).bulkWrite(
        rows.map((row) => ({
          updateOne: {
            filter: { _id: row._id, [counter.field]: row.stored ?? null },
            update: { $set: { [counter.field]: row.actual } },
          },
        })),
        { ordered: false },
      );
      skipped += rows.length - result.modifiedCount;
      console.log(`  updated ${result.modifiedCount}, skipped ${rows.length - result.modifiedCount}`);
    }

    console.log(`\n[recount] ${total} counter(s) ${mode === 'apply' ? 'processed' : 'differ'}`);
    if (skipped) console.log(`[recount] ${skipped} skipped because they changed meanwhile; run apply again`);
  } finally {
    await mongo.close();
  }
}

main().catch((error) => {
  console.error('[recount] failed:', error.message);
  process.exit(1);
});
