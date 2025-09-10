import { Router } from 'express';
import { Parser } from 'json2csv';
import { AdminActionLog, ClassRecord, Tutor } from './models.js';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'dvsAdmin0023';

function requireAdmin(req, res, next) {
  const headerPass = req.headers['x-admin-password'];
  const queryPass = req.query.adminPassword;
  const bodyPass = req.body?.adminPassword;
  const provided = headerPass || queryPass || bodyPass;
  if (provided !== ADMIN_PASSWORD) return res.status(401).json({ message: 'Unauthorized' });
  next();
}

const router = Router();

function buildDateFilter(from, to) {
  const filter = {};
  if (from || to) {
    filter.dateSubmitted = {};
    if (from) {
      const [y, m, d] = from.split('-').map(Number);
      filter.dateSubmitted.$gte = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
    }
    if (to) {
      const [y, m, d] = to.split('-').map(Number);
      filter.dateSubmitted.$lte = new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999);
    }
  }
  return filter;
}

// Export records CSV filtered by tutor and date range
router.get('/export', requireAdmin, async (req, res) => {
  try {
    const { tutorId, from, to } = req.query;
    const filter = buildDateFilter(from, to);
    if (tutorId) filter.tutorId = tutorId;
    const records = await ClassRecord.find(filter).populate('tutorId').populate('studentId');
    // Aggregate by tutor: sum payment amounts and output one row per tutor
    const byTutor = new Map();
    for (const r of records) {
      const key = (r.tutorId?._id || r.tutorId || '').toString();
      if (!key) continue;
      const current = byTutor.get(key) || {
        TutorID: key,
        Tutor: r.tutorId?.name || '',
        TutorBank: r.tutorId?.bank || '',
        TutorAccountNumber: r.tutorId?.accountNumber || '',
        TotalPaymentAmount: 0,
        Hours: 0
      };
      current.TotalPaymentAmount += Number(r.paymentAmount || 0);
      const startMs = r.startTime ? new Date(r.startTime).getTime() : NaN;
      const endMs = r.endTime ? new Date(r.endTime).getTime() : NaN;
      if (!isNaN(startMs) && !isNaN(endMs) && endMs > startMs) {
        current.Hours += (endMs - startMs) / 3600000; // hours
      }
      byTutor.set(key, current);
    }
    // Round hours to 2 decimal places for readability
    const rows = Array.from(byTutor.values()).map(r => ({
      ...r,
      Hours: Math.round(r.Hours * 100) / 100
    }));
    const fields = [
      'TutorID',
      'Tutor',
      'TutorBank',
      'TutorAccountNumber',
      'Hours',
      'TotalPaymentAmount'
    ];
    const parser = new Parser({ fields });
    const csv = parser.parse(rows || []);
    res.header('Content-Type', 'text/csv');
    res.attachment('class_records.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Export student summary: aggregate hours per student (optionally filter by tutor and date range)
router.get('/export-student-summary', requireAdmin, async (req, res) => {
  try {
    const { tutorId, from, to } = req.query;
    const filter = buildDateFilter(from, to);
    if (tutorId) filter.tutorId = tutorId;
    const records = await ClassRecord.find(filter).populate('studentId').populate('tutorId');
    const byStudent = new Map();
    for (const r of records) {
      const key = (r.studentId?._id || r.studentId || '').toString();
      if (!key) continue;
      const current = byStudent.get(key) || {
        StudentID: key,
        Student: r.studentId?.name || '',
        Class: r.classLevel || '',
        Hours: 0
      };
      const startMs = r.startTime ? new Date(r.startTime).getTime() : NaN;
      const endMs = r.endTime ? new Date(r.endTime).getTime() : NaN;
      if (!isNaN(startMs) && !isNaN(endMs) && endMs > startMs) {
        current.Hours += (endMs - startMs) / 3600000; // hours
      }
      byStudent.set(key, current);
    }
    const rows = Array.from(byStudent.values()).map(r => ({
      ...r,
      Hours: Math.round(r.Hours * 100) / 100
    }));
    const fields = ['StudentID', 'Student', 'Class', 'Hours'];
    const parser = new Parser({ fields });
    const csv = parser.parse(rows || []);
    res.header('Content-Type', 'text/csv');
    res.attachment('student_summary.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Approve late submission for a specific record (allows resubmission)
router.post('/late-approve/:recordId', requireAdmin, async (req, res) => {
  try {
    const { recordId } = req.params;
    const { adminName, notes } = req.body;
    if (!adminName) return res.status(400).json({ message: 'adminName is required' });
    const record = await ClassRecord.findById(recordId);
    if (!record) return res.status(404).json({ message: 'Record not found' });

    record.status = 'Late Approved';
    record.lateApprovedBy = adminName;
    record.lateApprovedAt = new Date();
    await record.save();

    await AdminActionLog.create({
      adminName,
      tutorId: record.tutorId,
      recordId: record._id,
      actionType: 'Late Record Override',
      notes
    });

    res.json({ message: 'Late submission approved. Tutor can re-submit record.', record });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// List tutors for admin dropdown
router.get('/tutors', requireAdmin, async (_req, res) => {
  const tutors = await Tutor.find().sort({ name: 1 });
  res.json(tutors);
});

export default router;


