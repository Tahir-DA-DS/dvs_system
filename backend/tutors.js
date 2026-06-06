import { Router } from 'express';
import { Tutor } from './models.js';

const router = Router();

// ── Create tutor (prevent duplicate names) ──
router.post('/', async (req, res) => {
  try {
    const { name, accountNumber, bank, subjects } = req.body;
    if (!name || !accountNumber || !bank || !Array.isArray(subjects) || subjects.length === 0)
      return res.status(400).json({ message: 'Missing required fields' });

    // Check for duplicate name (case-insensitive)
    const existing = await Tutor.findOne({ name: { $regex: `^${name.trim()}$`, $options: 'i' } });
    if (existing)
      return res.status(409).json({ message: `A tutor named "${name}" already exists` });

    const tutor = await Tutor.create({ name: name.trim(), accountNumber, bank, subjects });
    res.status(201).json(tutor);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── List tutors ──
router.get('/', async (_req, res) => {
  const tutors = await Tutor.find().sort({ name: 1 });
  res.json(tutors);
});

// ── Delete tutor ──
router.delete('/:id', async (req, res) => {
  try {
    const tutor = await Tutor.findById(req.params.id);
    if (!tutor) return res.status(404).json({ message: 'Tutor not found' });
    await tutor.deleteOne();
    res.json({ message: `Tutor "${tutor.name}" deleted successfully` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Update tutor ──
router.put('/:id', async (req, res) => {
  try {
    const { name, accountNumber, bank, subjects } = req.body;
    if (!name || !accountNumber || !bank || !Array.isArray(subjects) || subjects.length === 0)
      return res.status(400).json({ message: 'Missing required fields' });

    // Check duplicate name excluding self
    const existing = await Tutor.findOne({
      name: { $regex: `^${name.trim()}$`, $options: 'i' },
      _id: { $ne: req.params.id }
    });
    if (existing)
      return res.status(409).json({ message: `A tutor named "${name}" already exists` });

    const tutor = await Tutor.findByIdAndUpdate(
      req.params.id,
      { name: name.trim(), accountNumber, bank, subjects },
      { new: true }
    );
    if (!tutor) return res.status(404).json({ message: 'Tutor not found' });
    res.json(tutor);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;