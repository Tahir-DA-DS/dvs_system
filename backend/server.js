import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import bodyParser from 'body-parser';
import tutorRouter from './tutors.js';
import studentRouter from './students.js';
import classRecordRouter from './classRecords.js';
import adminRouter from './admin.js';
import { Tutor, Student, AdminActionLog, ClassRecord } from './models.js';

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/dvs_attendance';

const allowedOrigins = [
  'http://localhost:5173',                // Vite dev server
  'http://localhost:3000',               // local fallback
  process.env.FRONTEND_URL,             // your Vercel URL (set in Render env vars)
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

// ── Health endpoint — keeps Render free tier warm ──
app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

app.use('/api/tutors', tutorRouter);
app.use('/api/students', studentRouter);
app.use('/api/class-records', classRecordRouter);
app.use('/api/admin', adminRouter);

mongoose
  .connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB');

    await Tutor.syncIndexes();
    await Student.syncIndexes();
    await ClassRecord.syncIndexes();
    await AdminActionLog.syncIndexes();

    console.log('✅ Indexes synchronized');

    app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });