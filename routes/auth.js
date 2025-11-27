// your-app/routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // make sure path is correct

const router = express.Router();

// SIGN UP
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    // simple validation
    if (!name || !email || !password) {
      return res.status(400).json({ ok: false, message: 'Name, email and password are required' });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(409).json({ ok: false, message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      password: hashedPassword
    });

    // remove password before sending response
    const safeUser = {
      _id: user._id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt
    };

    return res.status(201).json({ ok: true, message: 'Signup successful', user: safeUser });
  } catch (error) {
    console.error('Signup error', error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ ok: false, message: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ ok: false, message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ ok: false, message: 'Invalid credentials' });
    }

    const secret = process.env.JWT_SECRET || 'fallback_secret'; // use env in production
    const token = jwt.sign({ id: user._id }, secret, { expiresIn: '7d' });

    const safeUser = {
      _id: user._id,
      name: user.name,
      email: user.email
    };

    return res.json({ ok: true, message: 'Login successful', token, user: safeUser });
  } catch (error) {
    console.error('Login error', error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

module.exports = router;
