import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import tutorRouter from './tutors.js';
import studentRouter from './students.js';
import classRecordRouter from './classRecords.js';
import adminRouter from './admin.js';
import { Tutor, Student, AdminActionLog, ClassRecord} from './models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/dvs_attendance';

app.use(cors());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/tutors', tutorRouter);
app.use('/api/students', studentRouter);
app.use('/api/class-records', classRecordRouter);
app.use('/api/admin', adminRouter);

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

mongoose
  .connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB');

    // 🧩 Add this line — it automatically removes outdated indexes (like userId_1)
    await Tutor.syncIndexes();
    await Student.syncIndexes();
    await ClassRecord.syncIndexes();
    await AdminActionLog.syncIndexes();
    
    console.log('✅ Tutor indexes synchronized with schema');

    app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });
