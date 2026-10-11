#!/usr/bin/env node
'use strict';

/**
 * AURORA legacy image migration (AURORA_DEV only).
 *
 * Usage (from AURORA backend repository root):
 *   node scripts/aurora-image-migration.cjs scan
 *   node scripts/aurora-image-migration.cjs upload
 *   node scripts/aurora-image-migration.cjs apply --backup-confirmed
 *
 * Does NOT move/delete local files, does NOT modify production database,
 * and does NOT upload unused files. Upload and apply are separate operations.
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
const DATA_DIR = path.join(ROOT, '.aurora-migration');
const MAP_PATH = path.join(DATA_DIR, 'cloudinary-image-map.json');
const TARGETS = new Set(['member','property','destination','article','board','support','tour']);
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp', '.tif', '.tiff']);
const mode = process.argv[2] || 'scan';
if (!['scan', 'upload', 'apply'].includes(mode)) {
  console.error('Usage: node scripts/aurora-image-migration.cjs scan|upload|apply [--backup-confirmed]');
  process.exit(1);
}
if (!process.env.MONGO_DEV) {
  console.error('MONGO_DEV not found. Set it in the AURORA backend .env (never paste credentials into chat).');
  process.exit(1);
}

function legacyPathOf(value) {
  if (typeof value !== 'string' || value.length > 2500) return null;
  let pathname = value.trim();
  try {
    if (/^https?:\/\//i.test(pathname)) pathname = new URL(pathname).pathname;
  } catch { return null; }
  pathname = pathname.split(/[?#]/)[0].replace(/^\/+/, '');
  const parts = pathname.split('/');
  if (parts.length !== 3 || parts[0] !== 'uploads' || !TARGETS.has(parts[1])) return null;
  if (parts.some(p => !p || p === '.' || p === '..' || p.includes('\\'))) return null;
  if (!IMAGE_EXTS.has(path.extname(parts[2]).toLowerCase())) return null;
  return pathname;
}

function walk(value, field, collector) {
  if (typeof value === 'string') {
    const legacyPath = legacyPathOf(value);
    if (legacyPath && field) collector(field, value, legacyPath);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, field ? `${field}.${i}` : String(i), collector));
    return;
  }
  // Do not introspect Date, ObjectId, BSON Binary or other non-plain objects.
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) return;
  for (const [key, v] of Object.entries(value)) {
    if (key === '_id' || key.includes('.') || key.startsWith('$')) continue;
    walk(v, field ? `${field}.${key}` : key, collector);
  }
}

function readMap() {
  if (!fs.existsSync(MAP_PATH)) return { db: DB_NAME, files: {} };
  const data = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
  if (data.db !== DB_NAME || !data.files || typeof data.files !== 'object') {
    throw new Error('Invalid migration map or wrong DB marker');
  }
  return data;
}
function saveMap(map) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${MAP_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(map, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, MAP_PATH);
}

async function collect(db) {
  const refs = new Map();
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  const counts = {};
  for (const { name } of collections) {
    if (name.startsWith('system.')) continue;
    let found = 0;
    const cursor = db.collection(name).find({}, { batchSize: 100 });
    for await (const doc of cursor) {
      walk(doc, '', (field, oldValue, legacyPath) => {
        found += 1;
        if (!refs.has(legacyPath)) refs.set(legacyPath, []);
        refs.get(legacyPath).push({ collection: name, _id: doc._id, field, oldValue });
      });
    }
    if (found) counts[name] = found;
  }
  return { refs, counts };
}

function existingFile(legacyPath) {
  const absolute = path.join(ROOT, ...legacyPath.split('/'));
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return null;
  return absolute;
}

async function main() {
  const mongo = new MongoClient(process.env.MONGO_DEV, { serverSelectionTimeoutMS: 15000 });
  await mongo.connect();
  try {
    const db = mongo.db(DB_NAME);
    const { refs, counts } = await collect(db);
    const map = readMap();
    const missing = [...refs.keys()].filter(k => !existingFile(k));
    const ready = [...refs.keys()].filter(k => !!existingFile(k));
    const mapped = ready.filter(k => !!map.files[k]?.url);
    console.log(`Database: ${DB_NAME} (development only)`);
    console.log('References by collection:', counts);
    console.log(`Reference occurrences: ${[...refs.values()].reduce((n, a) => n + a.length, 0)}`);
    console.log(`Unique legacy images referenced: ${refs.size}`);
    console.log(`Present locally: ${ready.length}; missing locally: ${missing.length}; already mapped: ${mapped.length}`);
    if (missing.length) console.log('First missing paths:', missing.slice(0, 15));

    if (mode === 'scan') {
      console.log('\nSCAN COMPLETE. No uploads and no database changes.');
      return;
    }

    if (mode === 'upload') {
      for (const env of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) {
        if (!process.env[env]) throw new Error(`${env} missing from local backend environment`);
      }
      const cloudinary = require('cloudinary').v2;
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true,
      });
      let success = 0, failed = 0;
      for (let i = 0; i < ready.length; i++) {
        const relative = ready[i];
        if (map.files[relative]?.url) continue;
        const [, target, filename] = relative.split('/');
        const publicId = path.parse(filename).name;
        try {
          const res = await cloudinary.uploader.upload(existingFile(relative), {
            folder: `aurora/legacy/${target}`,
            public_id: publicId,
            resource_type: 'image',
            unique_filename: false,
            overwrite: false,
          });
          if (!res.secure_url) throw new Error('Cloudinary returned no secure_url');
          map.files[relative] = {
            url: res.secure_url,
            public_id: res.public_id,
            uploaded_at: new Date().toISOString(),
          };
          saveMap(map); // Resume safely after interruptions.
          success++;
          if (success % 10 === 0) console.log(`Uploaded ${success}; progress ${i + 1}/${ready.length}`);
        } catch (err) {
          failed++;
          console.error(`Upload failed: ${relative}: ${err.message}`);
        }
      }
      console.log(`\nUPLOAD COMPLETE. Uploaded now: ${success}; failures: ${failed}`);
      console.log(`Map: ${MAP_PATH}`);
      console.log('No MongoDB records were changed.');
      return;
    }

    if (!process.argv.includes('--backup-confirmed')) {
      throw new Error('APPLY BLOCKED: first take a mongodump backup of AURORA_DEV, then add --backup-confirmed.');
    }
    // Pre-generate change manifest so old values can be restored if needed.
    const changes = [];
    for (const [legacyPath, occurrences] of refs) {
      const url = map.files[legacyPath]?.url;
      if (!url) continue;
      for (const ref of occurrences) {
        changes.push({
          collection: ref.collection,
          idString: String(ref._id),
          idType: typeof ref._id === 'string' ? 'string' : 'ObjectId',
          field: ref.field,
          before: ref.oldValue,
          after: url,
        });
      }
    }
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const manifestPath = path.join(DATA_DIR, `apply-manifest-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(manifestPath, JSON.stringify({ db: DB_NAME, changes }, null, 2), { mode: 0o600 });
    console.log(`Rollback reference manifest written BEFORE updates: ${manifestPath}`);
    let updated = 0, skipped = 0;
    for (const [legacyPath, occurrences] of refs) {
      const url = map.files[legacyPath]?.url;
      if (!url) { skipped += occurrences.length; continue; }
      for (const ref of occurrences) {
        const r = await db.collection(ref.collection).updateOne(
          { _id: ref._id, [ref.field]: ref.oldValue },
          { $set: { [ref.field]: url } },
        );
        updated += r.modifiedCount;
        if (!r.modifiedCount) skipped++;
      }
    }
    console.log(`APPLY COMPLETE: ${updated} fields changed; ${skipped} skipped/unmatched.`);
    console.log('No local files deleted. Check the site and missing image list.');
  } finally {
    await mongo.close();
  }
}

main().catch(err => {
  console.error(`Migration stopped: ${err.message}`);
  process.exitCode = 1;
});
