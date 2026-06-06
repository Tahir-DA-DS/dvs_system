import { Router } from 'express';
import { Student, Tutor } from './models.js';

const router = Router();

// ── Create student (prevent duplicate names) ──
router.post('/', async (req, res) => {
  try {
    const { name, classLevel, enrolledSubjects } = req.body;
    if (!name || !classLevel)
      return res.status(400).json({ message: 'Missing required fields' });

    // Check for duplicate name (case-insensitive)
    const existing = await Student.findOne({ name: { $regex: `^${name.trim()}$`, $options: 'i' } });
    if (existing)
      return res.status(409).json({ message: `A student named "${name}" already exists` });

    const student = await Student.create({
      name: name.trim(),
      classLevel,
      enrolledSubjects: enrolledSubjects || []
    });
    res.status(201).json(student);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── List students ──
router.get('/', async (_req, res) => {
  const students = await Student.find().sort({ name: 1 });
  res.json(students);
});

// ── Delete student ──
router.delete('/:id', async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: 'Student not found' });
    await student.deleteOne();
    res.json({ message: `Student "${student.name}" deleted successfully` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Update student ──
router.put('/:id', async (req, res) => {
  try {
    const { name, classLevel, enrolledSubjects } = req.body;
    if (!name || !classLevel)
      return res.status(400).json({ message: 'Missing required fields' });

    // Check duplicate name excluding self
    const existing = await Student.findOne({
      name: { $regex: `^${name.trim()}$`, $options: 'i' },
      _id: { $ne: req.params.id }
    });
    if (existing)
      return res.status(409).json({ message: `A student named "${name}" already exists` });

    const student = await Student.findByIdAndUpdate(
      req.params.id,
      { name: name.trim(), classLevel, enrolledSubjects: enrolledSubjects || [] },
      { new: true }
    );
    if (!student) return res.status(404).json({ message: 'Student not found' });
    res.json(student);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Suggest tutors for subjects ──
router.post('/suggest-tutors', async (req, res) => {
  try {
    const { subjects } = req.body;
    if (!Array.isArray(subjects) || subjects.length === 0)
      return res.status(400).json({ message: 'subjects must be an array' });
    const tutors = await Tutor.find({ subjects: { $in: subjects } }).sort({ name: 1 });
    res.json(tutors);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;