// routes/messages.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// adjust these requires to match your project structure
const Message = require('../models/Message'); // see model below (create if missing)
const Group = require('../models/Group');     // optional - used for validation (if present)
const User = require('../models/User');       // optional - used for validation (if present)

/**
 * Helper: try to get `from` user.
 * - Prefer Authorization header (Bearer token) if you have JWT middleware elsewhere.
 * - Otherwise accept from in req.body.from (useful for quick testing).
 */
function getFrom(req){
  // try header - expecting "Bearer <token>" if you have a separate auth middleware to decode it
  // But here we don't decode token; frontend currently sends `from` in many places so fallback is fine.
  if (req.body && req.body.from) return req.body.from;
  if (req.query && req.query.from) return req.query.from;
  return null;
}

/**
 * POST /api/messages/send
 * body: { from, to, text, groupId } 
 * - If groupId provided => message saved as group message
 * - Else if 'to' provided => direct message
 */
router.post('/send', async (req, res) => {
  try {
    const { to, text, groupId } = req.body || {};
    const from = getFrom(req);

    if (!from || !text) return res.status(400).json({ ok:false, message: 'from and text required' });

    if (groupId) {
      // Optional: validate group exists
      if (mongoose.models.Group) {
        const g = await Group.findById(groupId).lean().exec();
        if (!g) return res.status(404).json({ ok:false, message: 'Group not found' });
      }

      const msg = await Message.create({
        type: 'group',
        from,
        to: null,
        groupId,
        text,
        time: new Date()
      });

      return res.json({ ok:true, message: 'Group message saved', msg });
    } else {
      if (!to) return res.status(400).json({ ok:false, message: 'Direct messages require `to`' });

      const msg = await Message.create({
        type: 'direct',
        from,
        to,
        groupId: null,
        text,
        time: new Date()
      });

      return res.json({ ok:true, message: 'Direct message saved', msg });
    }
  } catch (err) {
    console.error('POST /api/messages/send error', err);
    res.status(500).json({ ok:false, message: 'Server error' });
  }
});

/**
 * GET /api/messages/direct/:u1/:u2
 * returns all direct messages between u1 and u2 (sorted asc)
 */
router.get('/direct/:u1/:u2', async (req, res) => {
  try {
    const { u1, u2 } = req.params;
    if (!u1 || !u2) return res.status(400).json({ ok:false, message: 'invalid users' });

    const messages = await Message.find({
      type: 'direct',
      $or: [
        { from: u1, to: u2 },
        { from: u2, to: u1 }
      ]
    }).sort({ time: 1 }).lean().exec();

    res.json(messages || []);
  } catch (err) {
    console.error('GET /api/messages/direct error', err);
    res.status(500).json({ ok:false, message: 'Server error' });
  }
});

/**
 * GET /api/groups/:groupId/messages
 * returns messages for a group
 */
router.get('/groups/:groupId/messages', async (req, res) => {
  try {
    const { groupId } = req.params;
    if (!groupId) return res.status(400).json({ ok:false, message: 'groupId required' });

    const messages = await Message.find({
      type: 'group',
      groupId: groupId
    }).sort({ time: 1 }).lean().exec();

    res.json(messages || []);
  } catch (err) {
    console.error('GET /api/groups/:groupId/messages error', err);
    res.status(500).json({ ok:false, message: 'Server error' });
  }
});

module.exports = router;
