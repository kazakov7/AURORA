#!/usr/bin/env node
'use strict';

/**
 * AURORA orphan payment check (AURORA_DEV or AURORA, picked explicitly). READ ONLY.
 *
 * Lists payments whose booking no longer exists and asks Stripe what happened to each one with a
 * GET request. Nothing is written: no refund, capture, cancel or database update. Provider ids are
 * shortened in the output; URIs and keys are never printed.
 *
 * Usage (from AURORA backend repository root):
 *   node scripts/aurora-orphan-payments.cjs dev|prod
 *
 * The Stripe key comes from STRIPE_SECRET_KEY in .env. A TEST key cannot see LIVE payments; the
 * output says which mode was used, so a "not found" from a TEST key is not proof of anything.
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
const target = TARGETS[process.argv[2]];
if (!target) {
  console.error('Usage: node scripts/aurora-orphan-payments.cjs dev|prod');
  process.exit(1);
}
if (!process.env[target.uri]) {
  console.error(`${target.uri} not found. Set it in the AURORA backend .env (never paste credentials into chat).`);
  process.exit(1);
}

const stripeKey = process.env.STRIPE_SECRET_KEY || '';
const keyMode = stripeKey.startsWith('sk_test_') ? 'TEST' : stripeKey.startsWith('sk_live_') ? 'LIVE' : 'none';
const shorten = (value) => (value ? `${String(value).slice(0, 3)}…${String(value).slice(-4)}` : '-');

async function stripeIntent(id) {
  const res = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${stripeKey}` },
  });
  const body = await res.json();
  if (!res.ok) return { found: false, http: res.status, code: body?.error?.code };
  return {
    found: true,
    livemode: body.livemode,
    status: body.status,
    amount: body.amount,
    amount_received: body.amount_received,
    currency: body.currency,
    created: new Date(body.created * 1000).toISOString(),
    canceled_at: body.canceled_at ? new Date(body.canceled_at * 1000).toISOString() : null,
    has_charge: Boolean(body.latest_charge),
    last_error: body.last_payment_error?.code ?? null,
  };
}

async function main() {
  const mongo = new MongoClient(process.env[target.uri], { serverSelectionTimeoutMS: 15000, readPreference: 'secondaryPreferred' });
  await mongo.connect();
  try {
    const db = mongo.db(target.db);
    console.log(`[orphan-payments] ${target.db}, Stripe key mode: ${keyMode}`);

    const payments = await db.collection('payments').find({}).toArray();
    const bookingIds = new Set(
      (await db.collection('bookings').find({ _id: { $in: payments.map((payment) => payment.bookingId) } }, { projection: { _id: 1 } }).toArray()).map((booking) => String(booking._id)),
    );
    const orphans = payments.filter((payment) => !bookingIds.has(String(payment.bookingId)));
    console.log(`[orphan-payments] ${payments.length} payment(s), ${orphans.length} without a booking`);

    for (const payment of orphans) {
      console.log(
        `\n  payment ${payment._id}  ${payment.paymentStatus}  ${payment.paymentAmount} ${payment.paymentCurrency}` +
          `  ${payment.paymentProvider} ${shorten(payment.providerPaymentId)}  created ${payment.createdAt?.toISOString?.() ?? '-'}`,
      );
      if (payment.paymentProvider !== 'STRIPE' || keyMode === 'none') continue;
      console.log('  stripe:', JSON.stringify(await stripeIntent(payment.providerPaymentId)));
    }
  } finally {
    await mongo.close();
  }
}

main().catch((error) => {
  console.error('[orphan-payments] failed:', error.message);
  process.exit(1);
});
