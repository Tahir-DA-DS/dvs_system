import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import bodyParser from 'body-parser';
import tutorRouter from './tutors.js';
import studentRouter from './students.js';
import classRecordRouter from './classRecords.js';
import adminRouter from './admin.js';
import ratesRouter from './rates.js';
import { Tutor, Student, AdminActionLog, ClassRecord, Rate, seedRatesIfEmpty, calculatePaymentAmount } from './models.js';

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/dvs_attendance';

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true,
}));

app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// ── Health endpoint ──
app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

app.use('/api/tutors', tutorRouter);
app.use('/api/students', studentRouter);
app.use('/api/class-records', classRecordRouter);
app.use('/api/admin', adminRouter);
app.use('/api/rates', ratesRouter);

// ── TEMPORARY: one-time payment fix route ──
app.get('/admin/fix-payments', async (req, res) => {
  const pass = req.headers['x-admin-password'] || req.query.p;
  if (pass !== (process.env.ADMIN_PASSWORD || 'dvsAdmin0023'))
    return res.status(401).json({ message: 'Unauthorized' });

  // Inline rate lookup — bypasses DB, uses hardcoded fallback directly
  function getRateInline(classLevel, subject) {
    const lvl = (classLevel || '').toLowerCase().trim();
    const isLang = subject && ['igbo', 'yoruba'].includes(String(subject).toLowerCase().trim());
    if (/year\s*(11|12)\b/i.test(lvl)) return isLang ? 4500 : 5000;
    if (/year\s*(7|8|9|10)\b/i.test(lvl)) return isLang ? 4500 : 4300;
    if (lvl === 'nursery' || /year\s*([1-6])\b/i.test(lvl)) return isLang ? 4000 : 3800;
    return 0;
  }

  try {
    const records = await ClassRecord.find({ paymentAmount: 0 });
    let fixed = 0;
    const details = [];
    for (const record of records) {
      const start = new Date(record.startTime);
      const end = new Date(record.endTime);
      const validTimes = !isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start;
      const rate = validTimes ? getRateInline(record.classLevel, record.subject) : 0;
      const minutes = validTimes ? (end.getTime() - start.getTime()) / 60000 : 0;
      const paymentAmount = Math.round(rate * (minutes / 60));
      if (paymentAmount > 0) {
        await ClassRecord.updateOne({ _id: record._id }, { $set: { paymentAmount } });
        fixed++;
      }
      details.push({
        id: record._id,
        classLevel: record.classLevel,
        subject: record.subject,
        rate,
        minutes,
        calculatedAmount: paymentAmount,
        action: paymentAmount > 0 ? 'fixed' : 'skipped'
      });
    }
    res.json({ message: `Done — ${fixed} fixed`, total: records.length, details });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Handles first-time seed AND migration from old rate keys to new ones
async function migrateRates() {
  const NEW_RATES = [
    { key: 'nursery_year1_6',       label: 'Nursery – Year 6 (General)',        ratePerHour: 3800, type: 'classLevel' },
    { key: 'year7_10',              label: 'Year 7 – Year 10 (General)',         ratePerHour: 4300, type: 'classLevel' },
    { key: 'year11_12',             label: 'Year 11 – Year 12 (General)',        ratePerHour: 5000, type: 'classLevel' },
    { key: 'igbo_yoruba_nursery_6', label: 'Igbo / Yoruba – Nursery to Year 6', ratePerHour: 4000, type: 'subject' },
    { key: 'igbo_yoruba_year7_12',  label: 'Igbo / Yoruba – Year 7 to Year 12', ratePerHour: 4500, type: 'subject' },
  ];
  // Remove old subject_igbo key if it exists
  await Rate.deleteOne({ key: 'subject_igbo' });
  // Upsert each new rate
  for (const r of NEW_RATES) {
    await Rate.updateOne({ key: r.key }, { $setOnInsert: r }, { upsert: true });
  }
  console.log('✅ Rates migrated');
}

mongoose
  .connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB');

    await Tutor.syncIndexes();
    await Student.syncIndexes();
    await ClassRecord.syncIndexes();
    await AdminActionLog.syncIndexes();

    // ── Migrate rates to new structure if needed ──
    await migrateRates();

    console.log('✅ Indexes synchronized');

    app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });