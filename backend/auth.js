const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'dvsAdmin0023';

export function requireAdmin(req, res, next) {
  const provided = req.headers['x-admin-password'];
  if (provided !== ADMIN_PASSWORD) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
}