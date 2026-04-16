/**
 * Must be used after authenticate().
 * Checks that the JWT contains the ADMIN role.
 */
function requireAdmin(req, res, next) {
  if (!Array.isArray(req.user?.roles) || !req.user.roles.includes('ADMIN')) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { requireAdmin };
