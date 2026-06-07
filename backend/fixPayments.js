/**
 * One-time script to fix class records with paymentAmount = 0
 * Run with: node fixPayments.js
 * Safe to run multiple times — only updates records where amount is 0
 */

import mongoose from 'mongoose';
import { ClassRecord, getHourlyRate } from './models.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/dvs_attendance';

async function fixPayments() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const records = await ClassRecord.find({ paymentAmount: 0 });
  console.log(`Found ${records.length} records with ₦0 payment`);

  if (!records.length) {
    console.log('Nothing to fix.');
    await mongoose.disconnect();
    return;
  }

  let fixed = 0;
  let skipped = 0;

  for (const record of records) {
    const start = new Date(record.startTime);
    const end = new Date(record.endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      console.log(`⚠️  Skipping record ${record._id} — invalid times`);
      skipped++;
      continue;
    }

    const rate = await getHourlyRate(record.classLevel, record.subject);
    const minutes = (end.getTime() - start.getTime()) / 60000;
    const hours = minutes / 60;
    const paymentAmount = Math.round(rate * hours);

    if (paymentAmount === 0) {
      console.log(`⚠️  Skipping record ${record._id} — rate returned 0 (classLevel: ${record.classLevel}, subject: ${record.subject})`);
      skipped++;
      continue;
    }

    await ClassRecord.updateOne(
      { _id: record._id },
      { $set: { paymentAmount } }
    );
    console.log(`✅ Fixed record ${record._id} — ${record.subject} / ${record.classLevel} → ₦${paymentAmount.toLocaleString()}`);
    fixed++;
  }

  console.log(`\n✅ Done — ${fixed} fixed, ${skipped} skipped`);
  await mongoose.disconnect();
}

fixPayments().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});