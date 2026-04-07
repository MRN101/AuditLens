const router = require('express').Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

// Validation schemas
const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  role: z.enum(['employee', 'auditor']).optional().default('employee'),
  location: z.string().max(100).optional().default(''),
  seniority: z.enum(['junior', 'mid', 'senior', 'executive']).optional().default('mid'),
  department: z.string().max(100).optional().default(''),
  employeeId: z.string().max(50).optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const parsed = registerSchema.parse(req.body);

    const existing = await User.findOne({ email: parsed.email });
    if (existing) return res.status(400).json({ message: 'Email already registered' });

    const user = await User.create({
      name: parsed.name,
      email: parsed.email,
      passwordHash: parsed.password,
      role: parsed.role,
      location: parsed.location,
      seniority: parsed.seniority,
      department: parsed.department,
      employeeId: parsed.employeeId,
    });

    const token = generateToken(user._id);
    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      location: user.location,
      seniority: user.seniority,
      department: user.department,
      complianceScore: user.complianceScore,
      token,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      const messages = err.errors.map(e => e.message);
      return res.status(400).json({ message: messages.join('. ') });
    }
    console.error('[Register Error]', err.message);
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || 'email';
      return res.status(400).json({ message: `${field === 'email' ? 'Email' : 'Employee ID'} already exists` });
    }
    res.status(500).json({ message: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const parsed = loginSchema.parse(req.body);

    const user = await User.findOne({ email: parsed.email });
    if (!user || !(await user.comparePassword(parsed.password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Account deactivated. Contact your administrator.' });
    }

    // Update last login
    user.lastLoginAt = new Date();
    await user.save();

    const token = generateToken(user._id);
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      location: user.location,
      seniority: user.seniority,
      department: user.department,
      complianceScore: user.complianceScore,
      token,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: err.errors.map(e => e.message).join('. ') });
    }
    console.error('[Login Error]', err.message);
    res.status(500).json({ message: 'Login failed. Please try again.' });
  }
});

// GET /api/auth/me
router.get('/me', protect, (req, res) => {
  res.json(req.user);
});

// PATCH /api/auth/profile — Update profile fields
router.patch('/profile', protect, async (req, res) => {
  const { name, location, department, seniority } = req.body;
  const updates = {};
  if (name?.trim()) updates.name = name.trim();
  if (location !== undefined) updates.location = location.trim();
  if (department !== undefined) updates.department = department.trim();
  if (seniority && ['junior', 'mid', 'senior', 'executive'].includes(seniority)) {
    updates.seniority = seniority;
  }

  const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
  res.json(user);
});

// POST /api/auth/change-password
router.post('/change-password', protect, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current and new password are required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters' });
  }

  const user = await User.findById(req.user._id);
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    return res.status(400).json({ message: 'Current password is incorrect' });
  }

  user.passwordHash = newPassword; // Will be hashed by pre-save hook
  await user.save();
  res.json({ message: 'Password changed successfully' });
});

module.exports = router;
