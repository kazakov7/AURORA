#!/usr/bin/env node
'use strict';

/**
 * AURORA social counter recount (AURORA_DEV or AURORA, picked explicitly).
 *
 * Likes, views, comments, follows, articles and reviews are denormalized onto members,
 * destinations, hotels, tours and articles. This script counts them again from the records
 * themselves and lists every counter that differs. Listing counters (memberProperties,
 * destinationTours, ...) stay with scripts/aurora-recount-listings.cjs.
 *
 * Usage (from AURORA backend repository root):
 *   node scripts/aurora-recount-counters.cjs scan dev|prod                       # read only, prints the differences
 *   node scripts/aurora-recount-counters.cjs apply dev|prod --backup-confirmed   # writes only the differing counters
 *
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

// Intentionally never configurable from CLI beyond picking one of the two.
const TARGETS = {
  dev: { uri: 'MONGO_DEV', db: 'AURORA_DEV' },
  prod: { uri: 'MONGO_PROD', db: 'AURORA' },
};
const mode = process.argv[2];
const target = TARGETS[process.argv[3]];
if (!['scan', 'apply'].includes(mode) || !target) {
  console.error('Usage: node scripts/aurora-recount-counters.cjs scan|apply dev|prod [--backup-confirmed]');
  process.exit(1);
}
if (mode === 'apply' && !process.argv.includes('--backup-confirmed')) {
  console.error(`apply writes to ${target.db}. Back the database up first, then pass --backup-confirmed.`);
  process.exit(1);
}
if (!process.env[target.uri]) {
  console.error(`${target.uri} not found. Set it in the AURORA backend .env (never paste credentials into chat).`);
  process.exit(1);
}

const ACTIVE_REVIEW = { reviewStatus: 'ACTIVE' };
const ACTIVE_COMMENT = { commentStatus: 'ACTIVE' };

// Each counter: the document holding it, the records it counts and how they are grouped
const COUNTERS = [
  { collection: 'members', field: 'memberArticles', records: 'articles', match: { articleStatus: 'PUBLISHED' }, groupKey: 'memberId' },
  { collection: 'members', field: 'memberComments', records: 'comments', match: ACTIVE_COMMENT, groupKey: 'memberId' },
  { collection: 'members', field: 'memberFollowers', records: 'follows', match: {}, groupKey: 'followingId' },
  { collection: 'members', field: 'memberFollowings', records: 'follows', match: {}, groupKey: 'followerId' },
  { collection: 'members', field: 'memberLikes', records: 'likes', match: { likeGroup: 'MEMBER' }, groupKey: 'likeRefId' },
  { collection: 'members', field: 'memberViews', records: 'views', match: { viewGroup: 'MEMBER' }, groupKey: 'viewRefId' },
  ...[
    ['destinations', 'destination', 'DESTINATION'],
    ['properties', 'property', 'PROPERTY'],
    ['tours', 'tour', 'TOUR'],
    ['articles', 'article', 'ARTICLE'],
  ].flatMap(([collection, prefix, group]) => [
    { collection, field: `${prefix}Likes`, records: 'likes', match: { likeGroup: group }, groupKey: 'likeRefId' },
    { collection, field: `${prefix}Views`, records: 'views', match: { viewGroup: group }, groupKey: 'viewRefId' },
    { collection, field: `${prefix}Comments`, records: 'comments', match: { commentGroup: group, ...ACTIVE_COMMENT }, groupKey: 'commentRefId' },
    { collection, field: `${prefix}Reviews`, records: 'reviews', match: { reviewGroup: group, ...ACTIVE_REVIEW }, groupKey: 'reviewRefId' },
    { collection, field: `${prefix}Rating`, records: 'reviews', match: { reviewGroup: group, ...ACTIVE_REVIEW }, groupKey: 'reviewRefId', average: 'reviewRating' },
  ]),
];

async function expectedValues(db, counter) {
  const value = counter.average ? { $avg: `$${counter.average}` } : { $sum: 1 };
  const rows = await db
    .collection(counter.records)
    .aggregate([{ $match: counter.match }, { $group: { _id: `$${counter.groupKey}`, value } }])
    .toArray();
  return new Map(rows.map((row) => [String(row._id), row.value]));
}

async function differences(db, counter) {
  const expected = await expectedValues(db, counter);
  const docs = await db
    .collection(counter.collection)
    .find({}, { projection: { [counter.field]: 1 } })
    .toArray();

  const rows = [];
  for (const doc of docs) {
    const stored = doc[counter.field] ?? 0;
    const actual = expected.get(String(doc._id)) ?? 0;
    if (Math.abs(stored - actual) > 1e-9) rows.push({ _id: doc._id, stored: doc[counter.field], actual });
  }
  return rows;
}

async function main() {
  const mongo = new MongoClient(process.env[target.uri], { serverSelectionTimeoutMS: 15000 });
  await mongo.connect();
  try {
    const db = mongo.db(target.db);
    console.log(`[recount-counters] ${mode} on ${target.db}`);
    let total = 0;
    let skipped = 0;

    for (const counter of COUNTERS) {
      const rows = await differences(db, counter);
      total += rows.length;
      if (!rows.length) continue;
      console.log(`\n${counter.collection}.${counter.field}: ${rows.length} to fix`);
      for (const row of rows) console.log(`  ${row._id}  ${row.stored ?? 'missing'} -> ${row.actual}`);
      if (mode !== 'apply') continue;

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

    console.log(`\n[recount-counters] ${total} counter(s) ${mode === 'apply' ? 'processed' : 'differ'}`);
    if (skipped) console.log(`[recount-counters] ${skipped} skipped because they changed meanwhile; run apply again`);
  } finally {
    await mongo.close();
  }
}

main().catch((error) => {
  console.error('[recount-counters] failed:', error.message);
  process.exit(1);
});
