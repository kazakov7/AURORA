#!/usr/bin/env node
'use strict';

/**
 * AURORA hotel stay date migration (AURORA_DEV or AURORA, picked explicitly).
 *
 * Checkout used to send a stay as midnights of the guest's own time zone, so a stay booked from
 * Seoul for 20-22 Oct was saved as 19 Oct 15:00Z - 21 Oct 15:00Z. The calendar, the hotel search
 * and the availability checks compare whole UTC days, so such nights showed up a day off. This
 * script moves checkIn/checkOut of hotel bookings to the UTC midnight of the day the guest picked,
 * and the visitedAt of their travel history with them.
 *
 * Usage (from AURORA backend repository root):
 *   node scripts/aurora-stay-dates.cjs scan dev|prod                       # read only, prints what would change
 *   node scripts/aurora-stay-dates.cjs apply dev|prod --backup-confirmed   # writes the new dates
 *
 * Run apply after the checkout fix is deployed, then scan again: only dates that are not UTC
 * midnights yet are touched, so another run is safe. Listed for a person and left alone:
 *   - a date between 10:00 and 12:00 UTC, which is midnight both of UTC+13/+14 and of UTC-10/-11;
 *   - a stay whose new dates give another number of nights than the guest paid for (DST).
 * apply refuses to run while new dates would overlap another live booking of the same hotel.
 * Tour bookings are NOT touched: their dates come from the tour.
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
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const mode = process.argv[2];
const target = TARGETS[process.argv[3]];
if (!['scan', 'apply'].includes(mode) || !target) {
  console.error('Usage: node scripts/aurora-stay-dates.cjs scan|apply dev|prod [--backup-confirmed]');
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

// The UTC day a guest's local midnight stands for: east of UTC it falls on the evening before,
// west of UTC on the morning of the day itself. null when the hour fits both sides.
function stayDay(date) {
  const sinceMidnight = date.getTime() % DAY_MS;
  if (sinceMidnight === 0) return date;
  if (sinceMidnight < 10 * HOUR_MS) return new Date(date.getTime() - sinceMidnight);
  if (sinceMidnight >= 12 * HOUR_MS) return new Date(date.getTime() - sinceMidnight + DAY_MS);
  return null;
}

const day = (date) => date.toISOString().slice(0, 10);
const stay = (booking) => `${booking.checkIn.toISOString()} - ${booking.checkOut.toISOString()}`;
const isLive = (booking, now) =>
  booking.bookingStatus === 'CONFIRMED' ||
  (booking.bookingStatus === 'PENDING' && (!booking.expiresAt || booking.expiresAt > now));

function plan(bookings) {
  const moves = [];
  const reviews = [];
  for (const booking of bookings) {
    const checkIn = stayDay(booking.checkIn);
    const checkOut = stayDay(booking.checkOut);
    if (checkIn === booking.checkIn && checkOut === booking.checkOut) continue;

    const nights = checkIn && checkOut ? Math.round((checkOut - checkIn) / DAY_MS) : 0;
    const paid = booking.priceSnapshot?.nights;
    if (!checkIn || !checkOut) {
      reviews.push({ booking, reason: 'midnight of UTC+13/+14 or of UTC-10/-11' });
    } else if (nights < 1 || (typeof paid === 'number' && nights !== paid)) {
      reviews.push({ booking, reason: `${nights} night(s) after the move, ${paid ?? '?'} paid` });
    } else {
      moves.push({ booking, checkIn, checkOut });
    }
  }
  return { moves, reviews };
}

// The new dates of every live booking of a hotel that gets a move, checked against each other
function conflictsOf(bookings, moves, now) {
  const moved = new Map(moves.map((move) => [String(move.booking._id), move]));
  const hotels = new Set(moves.map((move) => String(move.booking.bookingRefId)));
  const byHotel = new Map();
  for (const booking of bookings) {
    const hotelId = String(booking.bookingRefId);
    if (!hotels.has(hotelId) || !isLive(booking, now)) continue;
    const move = moved.get(String(booking._id));
    const dates = { _id: booking._id, checkIn: move?.checkIn ?? booking.checkIn, checkOut: move?.checkOut ?? booking.checkOut };
    byHotel.set(hotelId, [...(byHotel.get(hotelId) ?? []), dates]);
  }

  const conflicts = [];
  for (const [hotelId, stays] of byHotel) {
    stays.sort((a, b) => a.checkIn - b.checkIn);
    for (let i = 0; i < stays.length; i++) {
      for (let j = i + 1; j < stays.length && stays[j].checkIn < stays[i].checkOut; j++) {
        if (moved.has(String(stays[i]._id)) || moved.has(String(stays[j]._id))) {
          conflicts.push({ hotelId, first: stays[i], second: stays[j] });
        }
      }
    }
  }
  return conflicts;
}

async function main() {
  const mongo = new MongoClient(process.env[target.uri], { serverSelectionTimeoutMS: 15000 });
  await mongo.connect();
  try {
    const db = mongo.db(target.db);
    const now = new Date();
    console.log(`[stay-dates] ${mode} on ${target.db}`);
    const bookings = await db
      .collection('bookings')
      .find(
        { bookingCategory: 'PROPERTY', checkIn: { $type: 'date' }, checkOut: { $type: 'date' } },
        { projection: { bookingRefId: 1, bookingStatus: 1, checkIn: 1, checkOut: 1, expiresAt: 1, 'priceSnapshot.nights': 1 } },
      )
      .toArray();

    const { moves, reviews } = plan(bookings);
    console.log(`\n${moves.length} of ${bookings.length} hotel booking(s) need new dates`);
    for (const { booking, checkIn, checkOut } of moves) {
      console.log(`  ${booking._id}  ${stay(booking)} -> ${day(checkIn)} - ${day(checkOut)}  [${booking.bookingStatus}]`);
    }
    console.log(`\n${reviews.length} left for a person to decide`);
    for (const { booking, reason } of reviews) {
      console.log(`  ${booking._id}  ${stay(booking)}: ${reason}  [${booking.bookingStatus}]`);
    }

    // A completed stay saved its check-out as the visit date, so the visit moves to the same day
    const checkOuts = new Map(bookings.map((booking) => [String(booking._id), booking.checkOut]));
    for (const move of moves) checkOuts.set(String(move.booking._id), move.checkOut);
    const histories = (
      await db
        .collection('travel-histories')
        .find({ bookingId: { $in: bookings.map((booking) => booking._id) } }, { projection: { bookingId: 1, visitedAt: 1 } })
        .toArray()
    ).filter((history) => {
      const checkOut = checkOuts.get(String(history.bookingId));
      const visit = history.visitedAt instanceof Date ? stayDay(history.visitedAt) : null;
      return visit?.getTime() === checkOut.getTime() && history.visitedAt.getTime() !== checkOut.getTime();
    });
    console.log(`\n${histories.length} travel history date(s) move with them`);
    for (const history of histories) {
      console.log(`  ${history._id}  ${history.visitedAt.toISOString()} -> ${day(checkOuts.get(String(history.bookingId)))}`);
    }

    const conflicts = conflictsOf(bookings, moves, now);
    console.log(`\n${conflicts.length} conflict(s) with another live booking`);
    for (const { hotelId, first, second } of conflicts) {
      console.log(
        `  CONFLICT hotel ${hotelId}: ${first._id} (${day(first.checkIn)} - ${day(first.checkOut)}) and ${second._id} (${day(second.checkIn)} - ${day(second.checkOut)})`,
      );
    }

    if (mode !== 'apply' || (!moves.length && !histories.length)) return;
    if (conflicts.length) {
      console.error('[stay-dates] apply refused: cancel one booking of each conflict first');
      process.exitCode = 1;
      return;
    }

    // Matching the dates that were read leaves a booking or visit changed meanwhile alone
    if (moves.length) {
      const result = await db.collection('bookings').bulkWrite(
        moves.map(({ booking, checkIn, checkOut }) => ({
          updateOne: {
            filter: { _id: booking._id, checkIn: booking.checkIn, checkOut: booking.checkOut },
            update: { $set: { checkIn, checkOut } },
          },
        })),
        { ordered: false },
      );
      console.log(`[stay-dates] bookings updated ${result.modifiedCount}, skipped ${moves.length - result.modifiedCount}`);
    }
    if (histories.length) {
      const result = await db.collection('travel-histories').bulkWrite(
        histories.map((history) => ({
          updateOne: {
            filter: { _id: history._id, visitedAt: history.visitedAt },
            update: { $set: { visitedAt: checkOuts.get(String(history.bookingId)) } },
          },
        })),
        { ordered: false },
      );
      console.log(`[stay-dates] travel histories updated ${result.modifiedCount}, skipped ${histories.length - result.modifiedCount}`);
    }
  } finally {
    await mongo.close();
  }
}

main().catch((error) => {
  console.error('[stay-dates] failed:', error.message);
  process.exit(1);
});
