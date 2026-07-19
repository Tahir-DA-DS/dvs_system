import mongoose from 'mongoose';

const { Schema } = mongoose;

const TutorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    accountNumber: { type: String, required: true },
    bank: { type: String, required: true },
    subjects: { type: [String], required: true, default: [] }
  },
  { timestamps: true }
);

const StudentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    classLevel: { type: String, required: true },
    enrolledSubjects: { type: [String], default: [] }
  },
  { timestamps: true }
);

const ClassRecordSchema = new mongoose.Schema(
  {
    tutorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tutor', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    classLevel: { type: String, required: true },
    subject: { type: String, required: true },
    topic: { type: String, required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    dateSubmitted: { type: Date, required: true, default: () => new Date() },
    paymentAmount: { type: Number, required: true },
    status: {
      type: String,
      enum: ['Valid', 'Pending Approval', 'Approved', 'Late Approved', 'Rejected'],
      default: 'Valid'
    },
    lateApprovedBy: { type: String },
    lateApprovedAt: { type: Date },
    approvalRequest: {
      reason: String,
      requestDate: Date,
      approvedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
      approvalDate: Date
    }
  },
  { timestamps: true }
);

ClassRecordSchema.index({ startTime: 1 });
ClassRecordSchema.index({ tutorId: 1 });
ClassRecordSchema.index({ studentId: 1 });
ClassRecordSchema.index({ tutorId: 1, startTime: 1 });
ClassRecordSchema.index({ studentId: 1, startTime: 1 });

const AdminActionLogSchema = new mongoose.Schema(
  {
    adminName: { type: String, required: true },
    tutorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tutor' },
    recordId: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassRecord' },
    actionType: { type: String, required: true },
    notes: { type: String }
  },
  { timestamps: true }
);

AdminActionLogSchema.index({ tutorId: 1 });
AdminActionLogSchema.index({ createdAt: 1 });

const RateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    label: { type: String, required: true },
    ratePerHour: { type: Number, required: true },
    type: { type: String, enum: ['classLevel', 'subject'], default: 'classLevel' }
  },
  { timestamps: true }
);

export const Tutor = mongoose.model('Tutor', TutorSchema);
export const Student = mongoose.model('Student', StudentSchema);
export const ClassRecord = mongoose.model('ClassRecord', ClassRecordSchema);
export const AdminActionLog = mongoose.model('AdminActionLog', AdminActionLogSchema);
export const Rate = mongoose.model('Rate', RateSchema);

// ── In-memory rate cache ──
// Loaded once on startup from DB, falls back to hardcoded defaults.
// calculatePaymentAmount uses this — no DB call per submission.
let _rateCache = {
  nursery_year1_6:       3800,
  year7_10:              4300,
  year11_12:             5000,
  igbo_yoruba_nursery_6: 4000,
  igbo_yoruba_year7_12:  4500,
};

export async function loadRateCache() {
  try {
    const rates = await Rate.find();
    if (rates.length > 0) {
      rates.forEach(r => { _rateCache[r.key] = r.ratePerHour; });
    }
    console.log('✅ Rate cache loaded:', _rateCache);
  } catch (err) {
    console.warn('⚠️  Could not load rates from DB, using defaults:', err.message);
  }
}

export function refreshRateCache(key, value) {
  _rateCache[key] = value;
}

// ── Core rate lookup — checks higher years first to avoid regex false matches ──
export function getRateFromCache(classLevel, subject) {
  const lvl = (classLevel || '').toLowerCase().trim();
  const isLang = subject && ['igbo', 'yoruba'].includes(String(subject).toLowerCase().trim());

  if (/year\s*(11|12)\b/i.test(lvl))
    return isLang ? (_rateCache.igbo_yoruba_year7_12 ?? 4500) : (_rateCache.year11_12 ?? 5000);
  if (/year\s*(7|8|9|10)\b/i.test(lvl))
    return isLang ? (_rateCache.igbo_yoruba_year7_12 ?? 4500) : (_rateCache.year7_10 ?? 4300);
  if (lvl === 'nursery' || /year\s*([1-6])\b/i.test(lvl))
    return isLang ? (_rateCache.igbo_yoruba_nursery_6 ?? 4000) : (_rateCache.nursery_year1_6 ?? 3800);

  return 0;
}

export function getHourlyRateForClassLevel(classLevel, subject) {
  return getRateFromCache(classLevel, subject);
}

// ── Sync payment calculation — uses in-memory cache, no DB call ──
export function calculatePaymentAmount(classLevel, subject, startTime, endTime) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return 0;
  const rate = getRateFromCache(classLevel, subject);
  const minutes = (end.getTime() - start.getTime()) / 60000;
  return Math.round(rate * (minutes / 60));
}

// ── Seed / migrate rates in DB on startup ──
export async function migrateRates() {
  const DEFAULT_RATES = [
    { key: 'nursery_year1_6',       label: 'Nursery – Year 6 (General)',        ratePerHour: 3800, type: 'classLevel' },
    { key: 'year7_10',              label: 'Year 7 – Year 10 (General)',         ratePerHour: 4300, type: 'classLevel' },
    { key: 'year11_12',             label: 'Year 11 – Year 12 (General)',        ratePerHour: 5000, type: 'classLevel' },
    { key: 'igbo_yoruba_nursery_6', label: 'Igbo / Yoruba – Nursery to Year 6', ratePerHour: 4000, type: 'subject' },
    { key: 'igbo_yoruba_year7_12',  label: 'Igbo / Yoruba – Year 7 to Year 12', ratePerHour: 4500, type: 'subject' },
  ];
  await Rate.deleteOne({ key: 'subject_igbo' });
  for (const r of DEFAULT_RATES) {
    await Rate.updateOne({ key: r.key }, { $setOnInsert: r }, { upsert: true });
  }
  console.log('✅ Rates migrated');
}