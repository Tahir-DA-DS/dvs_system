import { Router } from 'express';
import { Tutor } from './models.js';

const router = Router();

// Create tutor
router.post('/', async (req, res) => {
  try {
    const { name, accountNumber, bank, subjects } = req.body;
    if (!name || !accountNumber || !bank || !Array.isArray(subjects) || subjects.length === 0) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    const tutor = await Tutor.create({ name, accountNumber, bank, subjects });
    res.status(201).json(tutor);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// List tutors
router.get('/', async (_req, res) => {
  const tutors = await Tutor.find().sort({ name: 1 });
  res.json(tutors);
});

export default router;


