import { Router } from 'express';
import { Rate } from './models.js';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'dvsAdmin0023';

function requireAdmin(req, res, next) {
  const provided = req.headers['x-admin-password'] || req.query.adminPassword || req.body?.adminPassword;
  if (provided !== ADMIN_PASSWORD) return res.status(401).json({ message: 'Unauthorized' });
  next();
}

const router = Router();

// ── Get all rates (public — needed by class-record.html to show live rate) ──
router.get('/', async (_req, res) => {
  try {
    const rates = await Rate.find().sort({ type: 1, key: 1 });
    res.json(rates);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Update a rate by key (admin only) ──
router.put('/:key', requireAdmin, async (req, res) => {
  try {
    const { ratePerHour } = req.body;
    if (typeof ratePerHour !== 'number' || ratePerHour < 0)
      return res.status(400).json({ message: 'ratePerHour must be a positive number' });

    const rate = await Rate.findOneAndUpdate(
      { key: req.params.key },
      { ratePerHour },
      { new: true }
    );
    if (!rate) return res.status(404).json({ message: 'Rate not found' });
    res.json(rate);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;