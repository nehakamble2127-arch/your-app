// routes/messages.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Use the models you already have in your project
const Group = require('../models/Group');                 // existing Group model
const GroupMessage = require('../models/GroupMessage');   // your GroupMessage model
let DirectMessageModel = null;
try { DirectMessageModel = require('../models/Message'); } catch (e) { DirectMessageModel = null; }

/* ---------- helpers ---------- */
function nowISO(){ return new Date().toISOString(); }
function makeId(){ return 'id_' + Math.random().toString(36).slice(2,9); }

/* ---------- Direct messages (existing behaviour) ---------- */
/*
  GET /api/messages?u1=alice&u2=bob      -> fetch direct messages between two users
  POST /api/send                         -> send direct message { from, to, message }
*/
router.get('/', async (req, res) => {
  const { u1, u2 } = req.query;
  if (!u1 || !u2) return res.status(400).json([]);
  if (DirectMessageModel) {
    try {
      const msgs = await DirectMessageModel.find({
        $or: [
          { from: u1, to: u2 },
          { from: u2, to: u1 }
        ]
      }).sort({ time: 1 }).lean();
      return res.json(msgs);
    } catch (err) {
      console.error('messages GET error', err);
      return res.status(500).json([]);
    }
  } else {
    // fallback - no direct message model available
    return res.status(404).json([]);
  }
});

router.post('/send', async (req, res) => {
  const { from, to, message } = req.body || {};
  if (!from || !to || !message) return res.status(400).json({ ok:false, message:'Missing fields' });

  if (DirectMessageModel) {
    try {
      const saved = await DirectMessageModel.create({ from, to, text: message, time: new Date() });
      return res.json({ ok:true, message:'sent', saved });
    } catch (err) {
      console.error('send error', err);
      return res.status(500).json({ ok:false, message:'server error' });
    }
  } else {
    // no direct message model available
    return res.status(501).json({ ok:false, message:'Direct messages not supported on server' });
  }
});

/* ---------- Group endpoints ---------- */
/*
  GET  /api/groups                 -> list groups (already used by client)
  POST /api/groups                 -> create group
  GET  /api/groups/:id/messages    -> get messages for a group (from GroupMessage collection)
  POST /api/groups/:id/message     -> send message to group (stores in GroupMessage + updates Group.lastMessage)
*/

// GET groups
router.get('/groups', async (req,res) => {
  try {
    const arr = await Group.find().lean();
    return res.json(arr);
  } catch (err) {
    console.error('groups GET', err);
    return res.status(500).json([]);
  }
});

// POST create group (keeps your existing behavior)
router.post('/groups', async (req,res) => {
  const { name, members, createdBy } = req.body || {};
  if (!name || !Array.isArray(members)) return res.status(400).json({ ok:false, message:'name + members required' });

  try {
    const g = await Group.create({ name, participants: members, creatorId: createdBy });
    return res.status(201).json({ ok:true, group: g });
  } catch (err) {
    console.error('create group error', err);
    return res.status(500).json({ ok:false, message:'server error' });
  }
});

// GET group messages (reads from GroupMessage collection)
router.get('/groups/:id/messages', async (req, res) => {
  const id = req.params.id;
  try {
    // Try to resolve to a Mongo ObjectId (group._id) or treat as custom id
    let group = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      group = await Group.findById(id).lean();
    }
    if (!group) group = await Group.findOne({ groupId: id }).lean();
    if (!group) group = await Group.findOne({ id: id }).lean();

    if (!group) return res.status(404).json([]);

    // fetch messages that reference this group's _id
    const msgs = await GroupMessage.find({ groupId: group._id }).sort({ time: 1 }).lean();
    return res.json(msgs);
  } catch (err) {
    console.error('group messages get', err);
    return res.status(500).json([]);
  }
});

// POST send message to group (robust: accepts from/senderId, tries multiple id lookups)
router.post('/groups/:id/message', async (req, res) => {
  const rawId = String(req.params.id || '');
  const from = req.body.from || req.body.senderId || req.body.sender || req.body.user;
  const text = req.body.text || req.body.message;

  console.log('POST /groups/:id/message received. params.id=', rawId, 'body=', { from, text });

  if (!from || !text) return res.status(400).json({ ok:false, message:'Missing from/senderId or text' });

  try {
    // Resolve the group robustly: try _id, then groupId, then id
    let group = null;
    if (mongoose.Types.ObjectId.isValid(rawId)) {
      try { group = await Group.findById(rawId); } catch(e){ /* ignore */ }
    }
    if (!group) group = await Group.findOne({ groupId: rawId });
    if (!group) group = await Group.findOne({ id: rawId });

    if (!group) {
      console.warn('Group not found for identifiers:', rawId);
      return res.status(404).json({ ok:false, message:'group not found' });
    }

    // Create message document in GroupMessage collection
    const msgDoc = await GroupMessage.create({
      groupId: group._id,
      senderId: from,
      text,
      time: new Date()
    });

    // Update group's lastMessage and lastUpdated
    group.lastMessage = { senderId: from, text, createdAt: msgDoc.time || new Date() };
    group.lastUpdated = new Date();
    await group.save();

    console.log('Saved group message:', msgDoc._id, 'for group', String(group._id));
    return res.status(201).json({ ok:true, msg: msgDoc });
  } catch (err) {
    console.error('group message post error', err);
    return res.status(500).json({ ok:false, message:'server error' });
  }
});

module.exports = router;
