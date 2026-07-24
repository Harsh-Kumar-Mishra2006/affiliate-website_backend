const roleCheck = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Required roles: ${allowedRoles.join(', ')}`
      });
    }

    next();
  };
};

const isAdmin = roleCheck('admin');
const isAffiliate = roleCheck('affiliate', 'admin');
const isUser = roleCheck('user', 'affiliate', 'admin');

module.exports = { roleCheck, isAdmin, isAffiliate, isUser };