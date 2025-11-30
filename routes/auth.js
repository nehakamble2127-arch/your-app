// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { nanoid } = require('nanoid');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key';

// Use existing User model if present, otherwise define
let User;
if (mongoose.models && mongoose.models.User) {
  User = mongoose.models.User;
} else {
  const userSchema = new mongoose.Schema({
    id: { type: String, default: () => nanoid() },
    name: String,
    username: String,
    email: { type: String, required: true, unique: true },
    password: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: Date
  }, { collection: 'users' });
  User = mongoose.model('User', userSchema);
}

// Helper: normalize email
function normalizeEmail(e) {
  return String(e || '').trim().toLowerCase();
}

// Helper: validate email format
function isValidEmailFormat(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Helper: validate password strength
function isValidPassword(password) {
  // At least 8 chars, 1 uppercase, 1 lowercase, 1 number
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
  return passwordRegex.test(password);
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { name, username, email, password } = req.body || {};

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ ok: false, message: 'Email and password are required' });
    }

    // Validate email format
    if (!isValidEmailFormat(email)) {
      return res.status(400).json({ ok: false, message: 'Invalid email format' });
    }

    // Validate password strength
    if (!isValidPassword(password)) {
      return res.status(400).json({ ok: false, message: 'Password must be at least 8 characters with 1 uppercase, 1 lowercase, and 1 number' });
    }

    const emailClean = normalizeEmail(email);

    // Check if user already exists
    const existing = await User.findOne({ email: emailClean }).lean();
    if (existing) return res.status(409).json({ ok: false, message: 'User already exists' });

    // Sanitize name input
    const sanitizedName = String(name || '').replace(/[<>]/g, '').substring(0, 50);

    const hashed = await bcrypt.hash(password, 12); // Increased cost for better security
    const user = new User({
      id: nanoid(),
      name: sanitizedName,
      username: username || sanitizedName || '',
      email: emailClean,
      password: hashed,
      createdAt: new Date()
    });

    await user.save();

    const safe = { id: user._id.toString(), name: user.name, email: user.email, createdAt: user.createdAt };
    // Sign token immediately
    const token = jwt.sign({ id: user._id.toString(), email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(201).json({ ok: true, message: 'Signup successful', token, user: safe });
  } catch (err) {
    console.error('signup error', err);
    if (err.code === 11000) return res.status(409).json({ ok: false, message: 'User already exists' });
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ ok: false, message: 'Email and password are required' });
    }

    // Validate email format
    if (!isValidEmailFormat(email)) {
      return res.status(400).json({ ok: false, message: 'Invalid email format' });
    }

    const emailClean = normalizeEmail(email);
    const user = await User.findOne({ email: emailClean }).lean();
    if (!user) {
      return res.status(401).json({ ok: false, message: 'Invalid email or password' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ ok: false, message: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: user._id.toString(), email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    const safeUser = { id: user._id.toString(), name: user.name, email: user.email };

    return res.json({ ok: true, message: 'Login successful', token, user: safeUser });
  } catch (err) {
    console.error('login error', err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  // Since we're using JWT tokens stored in localStorage on client,
  // server-side logout is mainly for consistency
  // Client should clear localStorage
  return res.json({ ok: true, message: 'Logged out successfully' });
});

module.exports = router;
