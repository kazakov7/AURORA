#!/usr/bin/env node
'use strict';

/**
 * AURORA agent businessNumberKey backfill (AURORA_DEV only).
 *
 * The unique rule "one live application per business" runs on businessNumberKey, the business
 * number without case and separators. Agents saved before that field existed have no key, so
 * this script fills it in from businessNumber.
 *
 * Usage (from AURORA backend repository root):
 *   node scripts/aurora-agent-business-key.cjs scan                       # read only, prints keys and collisions
 *   node scripts/aurora-agent-business-key.cjs apply --backup-confirmed   # writes the missing keys
 *
 * apply refuses to run while two live (PENDING/APPROVED) applications share one key: an admin
 * has to reject or revoke one of them first. Does NOT touch the production database.
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
const LIVE_STATUSES = new Set(['PENDING', 'APPROVED']);
const mode = process.argv[2] || 'scan';
if (!['scan', 'apply'].includes(mode)) {
  console.error('Usage: node scripts/aurora-agent-business-key.cjs scan|apply [--backup-confirmed]');
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

// Must stay identical to shapeIntoBusinessKey in apps/aurora-api/src/libs/config.ts
const shapeIntoBusinessKey = (text) =>
  String(text ?? '')
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]/gu, '');

async function main() {
  const mongo = new MongoClient(process.env.MONGO_DEV, { serverSelectionTimeoutMS: 15000 });
  await mongo.connect();
  try {
    const agents = mongo.db(DB_NAME).collection('agents');
    console.log(`[business-key] ${mode} on ${DB_NAME}`);
    const docs = await agents
      .find({}, { projection: { businessNumber: 1, businessNumberKey: 1, verificationStatus: 1 } })
      .toArray();

    const rows = docs
      .map((doc) => ({ ...doc, key: shapeIntoBusinessKey(doc.businessNumber) }))
      .filter((doc) => doc.businessNumberKey !== doc.key);
    console.log(`\n${rows.length} of ${docs.length} agent(s) need a key`);
    for (const row of rows) {
      console.log(`  ${row._id}  ${row.businessNumber} -> ${row.key || '(empty)'}  [${row.verificationStatus}]`);
    }

    // Two live applications on one key would break the unique index once both carry it
    const liveByKey = new Map();
    for (const doc of docs) {
      if (!LIVE_STATUSES.has(doc.verificationStatus)) continue;
      const key = shapeIntoBusinessKey(doc.businessNumber);
      liveByKey.set(key, [...(liveByKey.get(key) ?? []), doc._id]);
    }
    const collisions = [...liveByKey].filter(([key, ids]) => !key || ids.length > 1);
    for (const [key, ids] of collisions) {
      console.log(`  COLLISION ${key || '(empty key)'}: ${ids.join(', ')}`);
    }
    console.log(`[business-key] ${collisions.length} collision(s)`);

    if (mode !== 'apply' || !rows.length) return;
    if (collisions.length) {
      console.error('[business-key] apply refused: reject or revoke the colliding applications first');
      process.exitCode = 1;
      return;
    }

    // Matching the business number that was read leaves an application edited meanwhile alone
    const result = await agents.bulkWrite(
      rows.map((row) => ({
        updateOne: {
          filter: { _id: row._id, businessNumber: row.businessNumber },
          update: { $set: { businessNumberKey: row.key } },
        },
      })),
      { ordered: false },
    );
    console.log(`[business-key] updated ${result.modifiedCount}, skipped ${rows.length - result.modifiedCount}`);
  } finally {
    await mongo.close();
  }
}

main().catch((error) => {
  console.error('[business-key] failed:', error.message);
  process.exit(1);
});
