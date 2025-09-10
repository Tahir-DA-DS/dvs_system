import { Router } from 'express';
import { Student, Tutor } from './models.js';

const router = Router();

// Register new student
router.post('/', async (req, res) => {
  try {
    const { name, classLevel, enrolledSubjects } = req.body;
    if (!name || !classLevel) return res.status(400).json({ message: 'Missing required fields' });
    const student = await Student.create({ name, classLevel, enrolledSubjects: enrolledSubjects || [] });
    res.status(201).json(student);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// List students
router.get('/', async (_req, res) => {
  const students = await Student.find().sort({ name: 1 });
  res.json(students);
});

// Suggest tutors for subjects
router.post('/suggest-tutors', async (req, res) => {
  try {
    const { subjects } = req.body;
    if (!Array.isArray(subjects) || subjects.length === 0) {
      return res.status(400).json({ message: 'subjects must be an array' });
    }
    const tutors = await Tutor.find({ subjects: { $in: subjects } }).sort({ name: 1 });
    res.json(tutors);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;


