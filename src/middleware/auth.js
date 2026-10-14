const jwt = require('jsonwebtoken');
const ApiError = require('../utils/ApiError');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');

// Verifies the Bearer token and attaches req.user = { id, role, name, email }.
const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    throw new ApiError(401, 'Missing or invalid Authorization header');
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    throw new ApiError(401, 'Invalid or expired token');
  }

  const user = await User.findById(payload.id);
  if (!user) {
    throw new ApiError(401, 'User for this token no longer exists');
  }

  req.user = { id: user._id.toString(), role: user.role, name: user.name, email: user.email };
  next();
});

// Usage: requireRole('admin')
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new ApiError(403, `This action requires role: ${roles.join(' or ')}`));
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
