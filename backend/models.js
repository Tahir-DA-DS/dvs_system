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

// ── Indexes ──
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

// ── Rate Schema ──
// Stores hourly rates per class group and special subjects.
// key examples: 'nursery_year1_6', 'year7_10', 'year11_12', 'subject_igbo'
// Special subject rates (prefix 'subject_') override class-level rates.
const RateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },  // identifier
    label: { type: String, required: true },              // display name
    ratePerHour: { type: Number, required: true },        // ₦ per hour
    type: { type: String, enum: ['classLevel', 'subject'], default: 'classLevel' }
  },
  { timestamps: true }
);

export const Tutor = mongoose.model('Tutor', TutorSchema);
export const Student = mongoose.model('Student', StudentSchema);
export const ClassRecord = mongoose.model('ClassRecord', ClassRecordSchema);
export const AdminActionLog = mongoose.model('AdminActionLog', AdminActionLogSchema);
export const Rate = mongoose.model('Rate', RateSchema);

// ── Default rates (used as fallback if DB has no rates yet) ──
const DEFAULT_RATES = {
  subject_igbo:   4000,
  nursery_year1_6: 3800,
  year7_10:       4300,
  year11_12:      5000,
};

// ── Seed default rates into DB if collection is empty ──
export async function seedRatesIfEmpty() {
  const count = await Rate.countDocuments();
  if (count > 0) return;
  await Rate.insertMany([
    { key: 'subject_igbo',    label: 'Igbo (any level)',  ratePerHour: 4000, type: 'subject' },
    { key: 'nursery_year1_6', label: 'Nursery – Year 6',  ratePerHour: 3800, type: 'classLevel' },
    { key: 'year7_10',        label: 'Year 7 – Year 10',  ratePerHour: 4300, type: 'classLevel' },
    { key: 'year11_12',       label: 'Year 11 – Year 12', ratePerHour: 5000, type: 'classLevel' },
  ]);
  console.log('✅ Default rates seeded');
}

// ── Get hourly rate from DB (async) ──
export async function getHourlyRate(classLevel, subject) {
  const rates = await Rate.find();
  const rateMap = Object.fromEntries(rates.map(r => [r.key, r.ratePerHour]));

  // Subject overrides take priority
  if (subject && subject.toLowerCase().trim() === 'igbo') {
    return rateMap['subject_igbo'] ?? DEFAULT_RATES['subject_igbo'];
  }

  const lvl = (classLevel || '').toLowerCase().trim();
  if (lvl === 'nursery' || /\byear\s*(?:[1-6])\b/i.test(lvl))
    return rateMap['nursery_year1_6'] ?? DEFAULT_RATES['nursery_year1_6'];
  if (/\byear\s*(?:7|8|9|10)\b/i.test(lvl))
    return rateMap['year7_10'] ?? DEFAULT_RATES['year7_10'];
  if (/\byear\s*(?:11|12)\b/i.test(lvl))
    return rateMap['year11_12'] ?? DEFAULT_RATES['year11_12'];

  return 0;
}

// ── Sync version (fallback for non-async contexts) ──
export function getHourlyRateForClassLevel(classLevel, subject) {
  if (subject && String(subject).toLowerCase().trim() === 'igbo') return 4000;
  const lvl = (classLevel || '').toLowerCase().trim();
  if (lvl === 'nursery' || /\byear\s*(?:[1-6])\b/i.test(lvl)) return 3800;
  if (/\byear\s*(?:7|8|9|10)\b/i.test(lvl)) return 4300;
  if (/\byear\s*(?:11|12)\b/i.test(lvl)) return 5000;
  return 0;
}

// ── Async payment calculation (uses DB rates) ──
export async function calculatePaymentAmount(classLevel, subject, startTime, endTime) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return 0;
  const rate = await getHourlyRate(classLevel, subject);
  const minutes = (end.getTime() - start.getTime()) / 60000;
  return Math.round(rate * (minutes / 60));
}