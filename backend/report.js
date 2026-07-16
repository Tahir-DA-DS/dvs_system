import { Router } from 'express';
import { ClassRecord, Student, Tutor } from './models.js';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'dvsAdmin0023';

function requireAdmin(req, res, next) {
  const provided = req.headers['x-admin-password'] || req.query.p;
  if (provided !== ADMIN_PASSWORD) return res.status(401).json({ message: 'Unauthorized' });
  next();
}

const router = Router();

// ── Directors Report Data ──
router.get('/directors', requireAdmin, async (req, res) => {
  try {
    const { from, to, filterBy = 'startTime' } = req.query;

    // Date range filter
    const dateFilter = {};
    if (from || to) {
      dateFilter[filterBy] = {};
      if (from) dateFilter[filterBy].$gte = new Date(from);
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        dateFilter[filterBy].$lte = end;
      }
    }

    // All class records in date range
    const records = await ClassRecord.find(dateFilter)
      .populate('tutorId')
      .populate('studentId')
      .sort({ startTime: -1 });

    // All tutors
    const allTutors = await Tutor.find().sort({ name: 1 });

    // Active students (those with at least one class record)
    const activeStudentIds = [...new Set(records.map(r => r.studentId?._id?.toString()).filter(Boolean))];
    const activeStudents = await Student.find({ _id: { $in: activeStudentIds } }).sort({ name: 1 });

    // ── Section 1: Overview ──
    const overview = {
      totalStudents: activeStudents.length,
      totalTutors: allTutors.length,
      totalSessions: records.length,
      totalHours: Math.round(records.reduce((sum, r) => {
        const ms = new Date(r.endTime) - new Date(r.startTime);
        return sum + (ms > 0 ? ms / 3600000 : 0);
      }, 0) * 10) / 10,
      totalPayment: records.reduce((sum, r) => sum + (r.paymentAmount || 0), 0),
      dateRange: { from: from || null, to: to || null, filterBy }
    };

    // ── Section 2: Students by Class Level ──
    const classBuckets = {};
    const classOrder = ['Nursery', ...Array.from({ length: 12 }, (_, i) => `Year ${i + 1}`)];

    for (const student of activeStudents) {
      const cl = student.classLevel || 'Unknown';
      if (!classBuckets[cl]) classBuckets[cl] = [];
      // Find tutors for this student
      const studentRecords = records.filter(r => r.studentId?._id?.toString() === student._id.toString());
      const tutorNames = [...new Set(studentRecords.map(r => r.tutorId?.name).filter(Boolean))];
      const subjects = [...new Set(studentRecords.map(r => r.subject).filter(Boolean))];
      const sessionCount = studentRecords.length;
      classBuckets[cl].push({ name: student.name, tutors: tutorNames, subjects, sessionCount });
    }

    // Sort by class order
    const byClass = classOrder
      .filter(c => classBuckets[c])
      .map(c => ({ classLevel: c, students: classBuckets[c] }));

    // ── Section 3: Students by Tutor ──
    const byTutor = allTutors.map(tutor => {
      const tutorRecords = records.filter(r => r.tutorId?._id?.toString() === tutor._id.toString());
      const studentMap = {};
      for (const r of tutorRecords) {
        const sId = r.studentId?._id?.toString();
        if (!sId) continue;
        if (!studentMap[sId]) {
          studentMap[sId] = {
            name: r.studentId?.name || '',
            classLevel: r.studentId?.classLevel || r.classLevel || '',
            subjects: new Set(),
            sessions: 0
          };
        }
        studentMap[sId].subjects.add(r.subject);
        studentMap[sId].sessions++;
      }
      return {
        tutorName: tutor.name,
        bank: tutor.bank,
        accountNumber: tutor.accountNumber,
        subjects: tutor.subjects,
        totalSessions: tutorRecords.length,
        totalPayment: tutorRecords.reduce((s, r) => s + (r.paymentAmount || 0), 0),
        students: Object.values(studentMap).map(s => ({
          ...s,
          subjects: [...s.subjects]
        }))
      };
    }).filter(t => t.students.length > 0);

    // ── Section 4: Session Summary per Student ──
    const studentSummary = activeStudents.map(student => {
      const sr = records.filter(r => r.studentId?._id?.toString() === student._id.toString());
      const hours = sr.reduce((sum, r) => {
        const ms = new Date(r.endTime) - new Date(r.startTime);
        return sum + (ms > 0 ? ms / 3600000 : 0);
      }, 0);
      return {
        name: student.name,
        classLevel: student.classLevel,
        sessions: sr.length,
        hours: Math.round(hours * 10) / 10,
        subjects: [...new Set(sr.map(r => r.subject).filter(Boolean))],
        tutors: [...new Set(sr.map(r => r.tutorId?.name).filter(Boolean))]
      };
    });

    res.json({ overview, byClass, byTutor, studentSummary });
  } catch (err) {
    console.error('Directors report error:', err);
    res.status(500).json({ message: err.message });
  }
});

export default router;