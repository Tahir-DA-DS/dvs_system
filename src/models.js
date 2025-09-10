import mongoose from 'mongoose';

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
    classLevel: { type: String, required: true }, // Nursery, Year 1-12
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
    status: { type: String, enum: ['Valid', 'Late Approved'], default: 'Valid' },
    lateApprovedBy: { type: String },
    lateApprovedAt: { type: Date }
  },
  { timestamps: true }
);

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

export const Tutor = mongoose.model('Tutor', TutorSchema);
export const Student = mongoose.model('Student', StudentSchema);
export const ClassRecord = mongoose.model('ClassRecord', ClassRecordSchema);
export const AdminActionLog = mongoose.model('AdminActionLog', AdminActionLogSchema);

export function getHourlyRateForClassLevel(classLevel) {
  // Nursery–Year 6 → ₦3,800 per hour
  // Year 7–Year 10 → ₦4,300 per hour
  // Year 11–Year 12 → ₦5,000 per hour
  const lower = classLevel.toLowerCase();
  if (lower === 'nursery' || /year\s*[1-6]/i.test(classLevel)) return 3800;
  if (/year\s*(7|8|9|10)/i.test(classLevel)) return 4300;
  if (/year\s*(11|12)/i.test(classLevel)) return 5000;
  return 0;
}

export function calculatePaymentAmount(classLevel, startTime, endTime) {
  const rate = getHourlyRateForClassLevel(classLevel);
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return 0;
  const minutes = (end.getTime() - start.getTime()) / 60000;
  const hours = minutes / 60;
  // Round to nearest naira
  return Math.round(rate * hours);
}


