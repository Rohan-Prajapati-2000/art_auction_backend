const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

function signToken(user) {
  return jwt.sign({ id: user._id.toString(), role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, 'email and password are required');
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
  if (!user) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const ok = await user.comparePassword(password);
  if (!ok) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const token = signToken(user);

  res.json({
    success: true,
    data: {
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    },
  });
});

const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json({ success: true, data: { id: user._id, name: user.name, email: user.email, role: user.role } });
});

module.exports = { login, me };
