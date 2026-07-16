import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import bodyParser from 'body-parser';
import tutorRouter from './tutors.js';
import studentRouter from './students.js';
import classRecordRouter from './classRecords.js';
import adminRouter from './admin.js';
import ratesRouter from './rates.js';
import reportRouter from './report.js';
import {
  Tutor,
  Student,
  AdminActionLog,
  ClassRecord,
  Rate,
  seedRatesIfEmpty,
  calculatePaymentAmount
} from './models.js';

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
app.use('/api/report', reportRouter);

// ── One-time fix: correct ₦0 payment records ──
app.get('/admin/fix-payments', async (req, res) => {
  const pass = req.headers['x-admin-password'] || req.query.p;
  if (pass !== (process.env.ADMIN_PASSWORD || 'dvsAdmin0023'))
    return res.status(401).json({ message: 'Unauthorized' });
  try {
    const records = await ClassRecord.find({ paymentAmount: 0 });
    let fixed = 0;
    for (const record of records) {
      const paymentAmount = calculatePaymentAmount(
        record.classLevel, record.subject, record.startTime, record.endTime
      );
      if (paymentAmount > 0) {
        await ClassRecord.updateOne({ _id: record._id }, { $set: { paymentAmount } });
        fixed++;
      }
    }
    res.json({ message: `Done — ${fixed} of ${records.length} records fixed` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

mongoose
  .connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB');

    await Tutor.syncIndexes();
    await Student.syncIndexes();
    await ClassRecord.syncIndexes();
    await AdminActionLog.syncIndexes();

  await seedRatesIfEmpty();

    console.log('✅ Indexes synchronized');

    app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });