const router = require('express').Router();
const jwt = require('jsonwebtoken');
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

module.exports = router;
