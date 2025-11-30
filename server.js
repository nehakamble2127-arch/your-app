// server.js - sms-app (native + mongoose)
// Requirements: npm i mongodb mongoose nanoid cors dotenv

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const mongoose = require('mongoose');
const { nanoid } = require('nanoid');
const path = require('path');
const { createServer } = require('http');
const { Server } = require('socket.io');

// Import models
const GroupMessage = require('./models/GroupMessage');



const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// === Serve signup as the site root ===
// place this BEFORE express.static so it takes precedence
app.get('/', (req, res) => {
  return res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

// keep index route available if needed (optional)
app.get('/index.html', (req, res) => {
  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// now serve static assets from public/ (single registration)
app.use(express.static(path.join(__dirname, 'public')));



if (!process.env.MONGO_URI) {
  console.error('Missing MONGO_URI in .env. Exiting.');
  process.exit(1);
}

const MONGO_URI = process.env.MONGO_URI;
const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 10000, family: 4 });

let db, messagesColl, groupsColl;

// connect native Mongo + mongoose
async function connectAll() {
  await client.connect();
  console.log('💚 Native Mongo connected');
  db = client.db('sms_app');
  messagesColl = db.collection('messages');
  groupsColl = db.collection('groups');

  // indexes (best-effort)
  try { await messagesColl.createIndex({ groupId: 1, time: 1 }); } catch(e){/*ignore*/ }
  try { await messagesColl.createIndex({ from:1, to:1, time:1 }); } catch(e){/*ignore*/ }
  try { await groupsColl.createIndex({ name: 1 }); } catch(e){/*ignore*/ }

  // mongoose (for auth routes if you have them)
  await mongoose.connect(MONGO_URI);
  console.log('🟣 Mongoose connected');
}

// mount auth routes (assumes ./routes/auth uses mongoose models)
function mountAuth() {
  try {
    const authRoutes = require('./routes/auth');
    app.use('/api/auth', authRoutes);
    console.log('Mounted /api/auth routes');
  } catch (err) {
    console.warn('No ./routes/auth found or it failed to load. If you rely on auth routes, ensure routes/auth exists.', err.message);
  }
}

/* ---------- API (all under /api) ---------- */

app.get('/api/contacts', async (req, res) => {
  try {
    const User = mongoose.models.User;
    if (!User) return res.status(500).json({ ok: false, message: 'User model not available' });
    const users = await User.find({}, 'name username').lean();
    const contacts = users.map(u => ({
      id: u._id.toString(),
      name: u.name || u.username,
      username: u.username
    })).filter(u => u.name);
    res.json(contacts);
  } catch (err) {
    console.error('GET /api/contacts error', err);
    res.status(500).json({ ok: false, message: 'server error' });
  }
});

/**
 * POST /api/send
 * body: { from, to, message }
 * stores a direct message (kind: 'direct') with string _id
 */
app.post('/api/send', async (req, res) => {
  try {
    const { from, to, message } = req.body || {};
    if (!from || !to || !message) return res.status(400).json({ ok: false, message: 'from,to,message required' });

    const doc = {
      _id: nanoid(),
      kind: 'direct',
      from: String(from),
      to: String(to),
      text: String(message),
      time: new Date().toISOString()
    };

    await messagesColl.insertOne(doc);
    res.status(201).json({ ok: true, msg: doc });
  } catch (err) {
    console.error('POST /api/send error', err);
    res.status(500).json({ ok: false, message: 'server error' });
  }
});

/**
 * GET /api/messages?u1=alice&u2=bob
 */
app.get('/api/messages', async (req, res) => {
  try {
    const { u1, u2 } = req.query;
    if (!u1 || !u2) return res.status(400).json({ ok: false, message: 'u1 and u2 required' });

    const cursor = await messagesColl.find({
      kind: 'direct',
      $or: [
        { from: u1, to: u2 },
        { from: u2, to: u1 }
      ]
    }).sort({ time: 1 });

    const arr = await cursor.toArray();
    res.json(arr);
  } catch (err) {
    console.error('GET /api/messages error', err);
    res.status(500).json({ ok: false, message: 'server error' });
  }
});

/**
 * POST /api/groups
 * body: { name, members: [..], createdBy? }
 * returns { ok:true, group }
 */
app.post('/api/groups', async (req, res) => {
  try {
    const { name, members, createdBy } = req.body || {};
    if (!name || !Array.isArray(members)) return res.status(400).json({ ok: false, message: 'name and members[] required' });

    const cleaned = [...new Set(members.map(m => String(m).trim()).filter(Boolean))].slice(0, 10);
    if (cleaned.length === 0) return res.status(400).json({ ok: false, message: 'at least 1 member required' });

    const doc = {
      _id: nanoid(),            // string id (keeps UI simple)
      name: String(name).trim(),
      members: cleaned,
      createdBy: createdBy ? String(createdBy) : null,
      createdAt: new Date().toISOString()
    };

    await groupsColl.insertOne(doc);
    // return the created group object so frontend can use it directly
    res.status(201).json({ ok: true, group: doc });
  } catch (err) {
    console.error('POST /api/groups error', err);
    res.status(500).json({ ok: false, message: 'server error' });
  }
});

/**
 * GET /api/groups
 * optional query ?member=name
 */
app.get('/api/groups', async (req, res) => {
  try {
    const { member } = req.query;
    const q = member ? { members: member } : {};
    const arr = await groupsColl.find(q).sort({ createdAt: -1 }).toArray();
    res.json(arr);
  } catch (err) {
    console.error('GET /api/groups error', err);
    res.status(500).json({ ok: false, message: 'server error' });
  }
});

/**
 * DELETE /api/groups/:id
 * id is the string _id we inserted with nanoid
 */
app.delete('/api/groups/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ ok: false, message: 'id required' });
    let query = { _id: id };
    // Handle both string _id (nanoid) and ObjectId
    if (id.length === 24 && /^[0-9a-fA-F]+$/.test(id)) {
      query = { $or: [{ _id: id }, { _id: new ObjectId(id) }] };
    }
    const result = await groupsColl.deleteOne(query);
    if (result.deletedCount === 1) return res.json({ ok: true });
    return res.status(404).json({ ok: false, message: 'group not found' });
  } catch (err) {
    console.error('DELETE /api/groups/:id error', err);
    res.status(500).json({ ok: false, message: 'server error' });
  }
});

/**
 * POST /api/groups/:id/message
 * body: { from, text }  -> stores a group message in groupmessages collection
 */
app.post('/api/groups/:id/message', async (req, res) => {
  try {
    const id = req.params.id;
    const { from, text } = req.body || {};
    if (!id || !from || !text) return res.status(400).json({ ok: false, message: 'id,from,text required' });

    // ensure group exists
    const g = await groupsColl.findOne({ _id: id });
    if (!g) return res.status(404).json({ ok: false, message: 'group not found' });

    const doc = {
      groupId: id,
      from: String(from),
      text: String(text),
      time: new Date().toISOString()
    };

    const msg = await GroupMessage.create(doc);
    res.status(201).json({ ok: true, msg: { _id: msg._id, ...doc } });
  } catch (err) {
    console.error('POST /api/groups/:id/message error', err);
    res.status(500).json({ ok: false, message: 'server error' });
  }
});

/**
 * GET /api/groups/:id/messages  -> group messages (ascending)
 */
app.get('/api/groups/:id/messages', async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ ok: false, message: 'id required' });
    const arr = await GroupMessage.find({ groupId: id }).sort({ time: 1 }).lean();
    res.json(arr);
  } catch (err) {
    console.error('GET /api/groups/:id/messages error', err);
    res.status(500).json({ ok: false, message: 'server error' });
  }
});

/* optional debug endpoints (dev only) */
app.get('/api/debug/groups', async (req, res) => {
  try {
    const arr = await groupsColl.find({}).sort({ createdAt: -1 }).toArray();
    res.json({ ok: true, count: arr.length, groups: arr });
  } catch (e) {
    res.status(500).json({ ok: false, message: 'error' });
  }
});

app.get('/api/debug/messages', async (req, res) => {
  try {
    const arr = await messagesColl.find({}).sort({ time: -1 }).limit(200).toArray();
    res.json({ ok: true, count: arr.length, messages: arr });
  } catch (e) {
    res.status(500).json({ ok: false, message: 'error' });
  }
});

/* ---------- Socket.IO Real-time Chat ---------- */
io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);

  // Join user to their personal room for direct messages
  socket.on('join', (userId) => {
    socket.join(userId);
    console.log(`👤 User ${userId} joined their room`);
  });

  // Join user to group rooms
  socket.on('join-group', (groupId) => {
    socket.join(`group-${groupId}`);
    console.log(`👥 User joined group ${groupId}`);
  });

  // Handle direct messages
  socket.on('send-message', async (data) => {
    try {
      const { from, to, message } = data;
      const doc = {
        _id: nanoid(),
        kind: 'direct',
        from: String(from),
        to: String(to),
        text: String(message),
        time: new Date().toISOString()
      };

      await messagesColl.insertOne(doc);

      // Send to recipient
      io.to(to).emit('new-message', doc);
      // Send back to sender
      socket.emit('message-sent', doc);

    } catch (err) {
      console.error('Socket send-message error:', err);
      socket.emit('message-error', { error: 'Failed to send message' });
    }
  });

  // Handle group messages
  socket.on('send-group-message', async (data) => {
    try {
      const { groupId, from, text } = data;

      const doc = {
        groupId: groupId,
        from: String(from),
        text: String(text),
        time: new Date().toISOString()
      };

      const msg = await GroupMessage.create(doc);

      // Send to all users in the group room
      io.to(`group-${groupId}`).emit('new-group-message', { _id: msg._id, ...doc });

      // Send confirmation back to sender
      socket.emit('message-sent', { _id: msg._id, ...doc });

    } catch (err) {
      console.error('Socket send-group-message error:', err);
      socket.emit('message-error', { error: 'Failed to send group message' });
    }
  });

  // Handle typing indicators
  socket.on('typing', (data) => {
    const { to, isTyping } = data;
    socket.to(to).emit('user-typing', { from: socket.id, isTyping });
  });

  socket.on('group-typing', (data) => {
    const { groupId, isTyping } = data;
    socket.to(`group-${groupId}`).emit('user-group-typing', {
      from: socket.id,
      groupId,
      isTyping
    });
  });

  socket.on('disconnect', () => {
    console.log('🔌 User disconnected:', socket.id);
  });
});

/* ---------- start server ---------- */
async function start() {
  await connectAll();
  mountAuth();

  const PORT = process.env.PORT || 3001;
  server.listen(PORT, () => {
    console.log(`🚀 Server listening on http://localhost:${PORT}`);
    console.log(`🔌 Socket.IO ready for real-time chat`);
  });
}

start().catch(err => {
  console.error('Startup error', err);
  process.exit(1);
});
