// ============= ROLE CHECK MIDDLEWARE =============

// Check if user is admin
const isAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Admin privileges required.'
    });
  }

  next();
};

// Check if user is affiliate
// ⚠️ NOTE: This is NOT used for product management anymore.
// Affiliate role is reserved for future features (analytics, reporting, etc.)
const isAffiliate = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  if (req.user.role !== 'affiliate' && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Affiliate privileges required.'
    });
  }

  next();
};

// Check if user is either admin or affiliate
// ⚠️ NOTE: This is NOT used for product management anymore.
const isAdminOrAffiliate = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  if (req.user.role !== 'admin' && req.user.role !== 'affiliate') {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Admin or affiliate privileges required.'
    });
  }

  next();
};

module.exports = {
  isAdmin,
  isAffiliate,
  isAdminOrAffiliate
};