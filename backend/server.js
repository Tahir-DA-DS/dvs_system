import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import bodyParser from 'body-parser';
import tutorRouter from './tutors.js';
import studentRouter from './students.js';
import classRecordRouter from './classRecords.js';
import adminRouter from './admin.js';
import ratesRouter from './rates.js';
import { Tutor, Student, AdminActionLog, ClassRecord, Rate, seedRatesIfEmpty } from './models.js';

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