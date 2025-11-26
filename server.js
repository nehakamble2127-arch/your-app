// server.js -- full ready file
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public")); // serve UI from public/

// Ensure MONGO_URI is set in .env
if (!process.env.MONGO_URI) {
  console.error("Missing MONGO_URI in .env. Exiting.");
  process.exit(1);
}

// modern MongoClient (v4/v5+), no useNewUrlParser/useUnifiedTopology options
const client = new MongoClient(process.env.MONGO_URI);

let messages; // collection for all messages (direct + group messages)
let groups;   // collection for groups

async function connectDB() {
  try {
    await client.connect();
    const db = client.db("sms_app"); // DB name
    messages = db.collection("messages");
    groups = db.collection("groups");

    // optional indexes (helpful)
    await messages.createIndex({ groupId: 1, time: 1 });
    await messages.createIndex({ from: 1, to: 1, time: 1 });
    await groups.createIndex({ name: 1 }, { unique: false });

    console.log("💚 MongoDB Connected (sms_app)");
  } catch (err) {
    console.error("❌ MongoDB Error:", err);
    process.exit(1);
  }
}
connectDB();

/* ======================
   Direct message endpoints
   ====================== */

// POST /send  -> send direct (one-to-one) message
app.post("/send", async (req, res) => {
  try {
    const { from, to, message } = req.body;
    if (!from || !to || !message) return res.status(400).json({ error: "from, to, message required" });

    const doc = {
      kind: "direct",
      from: String(from),
      to: String(to),
      message: String(message).slice(0, 1000),
      time: new Date()
    };

    const result = await messages.insertOne(doc);
    console.log("Inserted direct message:", result.insertedId);
    res.json({ success: true, id: result.insertedId });
  } catch (err) {
    console.error("POST /send error", err);
    res.status(500).json({ error: "server error" });
  }
});

// GET /messages?u1=alice&u2=bob  -> chat between two users
app.get("/messages", async (req, res) => {
  try {
    const { u1, u2 } = req.query;
    if (!u1 || !u2) return res.status(400).json({ error: "u1 and u2 required" });

    const chat = await messages.find({
      kind: "direct",
      $or: [
        { from: u1, to: u2 },
        { from: u2, to: u1 }
      ]
    }).sort({ time: 1 }).toArray();

    res.json(chat);
  } catch (err) {
    console.error("GET /messages error", err);
    res.status(500).json({ error: "server error" });
  }
});

// GET /messages_for?user=alice  -> inbox helper (direct messages to/from user)
app.get("/messages_for", async (req, res) => {
  try {
    const user = req.query.user;
    if (!user) return res.status(400).json({ error: "user required" });

    const arr = await messages.find({
      kind: "direct",
      $or: [{ to: user }, { from: user }]
    }).sort({ time: -1 }).limit(500).toArray();

    res.json(arr);
  } catch (err) {
    console.error("GET /messages_for error", err);
    res.status(500).json({ error: "server error" });
  }
});

// GET /messages_all  -> dev helper: returns recent direct + group messages
app.get("/messages_all", async (req, res) => {
  try {
    const arr = await messages.find({}).sort({ time: -1 }).limit(500).toArray();
    res.json(arr);
  } catch (err) {
    console.error("GET /messages_all error", err);
    res.status(500).json({ error: "server error" });
  }
});

/* ======================
   Groups endpoints
   ====================== */

// POST /groups  -> create a group (name + members[] + optional createdBy)
app.post("/groups", async (req, res) => {
  try {
    const { name, members, createdBy } = req.body;
    if (!name || typeof name !== "string") return res.status(400).json({ error: "group name required" });
    if (!Array.isArray(members)) return res.status(400).json({ error: "members must be an array" });

    // clean and dedupe members
    const cleaned = [...new Set(members.map(m => String(m).trim()).filter(Boolean))];
    if (cleaned.length === 0) return res.status(400).json({ error: "at least one member required" });
    if (cleaned.length > 10) return res.status(400).json({ error: "max 10 members allowed" });

    const doc = {
      name: String(name).trim(),
      members: cleaned,
      createdBy: createdBy ? String(createdBy) : null,
      createdAt: new Date()
    };

    const result = await groups.insertOne(doc);
    console.log("Created group:", result.insertedId);
    res.json({ success: true, id: result.insertedId });
  } catch (err) {
    console.error("POST /groups error", err);
    res.status(500).json({ error: "server error" });
  }
});

// GET /groups  -> list groups (optional ?member=username to filter)
app.get("/groups", async (req, res) => {
  try {
    const { member } = req.query;
    const q = member ? { members: member } : {};
    const arr = await groups.find(q).sort({ createdAt: -1 }).toArray();
    res.json(arr);
  } catch (err) {
    console.error("GET /groups error", err);
    res.status(500).json({ error: "server error" });
  }
});

// DELETE /groups/:id -> delete group by ObjectId
app.delete("/groups/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: "invalid id" });

    const result = await groups.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 1) {
      console.log("Deleted group:", id);
      // Optionally: also delete group messages (uncomment if desired)
      // await messages.deleteMany({ groupId: new ObjectId(id) });
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "group not found" });
    }
  } catch (err) {
    console.error("DELETE /groups/:id error", err);
    res.status(500).json({ error: "server error" });
  }
});

/* ======================
   Group messages (group chat)
   ====================== */

// POST /groups/:id/message -> post a message to a group
// POST /send  -> send direct (one-to-one) message
app.post("/send", async (req, res) => {
  try {
    const { from, to, message } = req.body;
    if (!from || !to || !message) return res.status(400).json({ error: "from, to, message required" });

    const doc = {
      kind: "direct",
      from: String(from),
      to: String(to),
      message: String(message).slice(0, 1000),
      time: new Date()
    };

    const result = await messages.insertOne(doc);
    doc._id = result.insertedId;                // attach id so client gets exact saved doc
    console.log("Inserted direct message:", result.insertedId, doc.time);

    // return saved message so client shows server timestamp
    res.json({ success: true, message: doc, id: result.insertedId });
  } catch (err) {
    console.error("POST /send error", err);
    res.status(500).json({ error: "server error" });
  }
});


// GET /groups/:id/messages -> list messages for a group (sorted ascending)
app.get('/groups/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'invalid group id' });

    const arr = await messages.find({ kind: "group", groupId: new ObjectId(id) }).sort({ time: 1 }).toArray();
    res.json(arr);
  } catch (err) {
    console.error("GET /groups/:id/messages error", err);
    res.status(500).json({ error: "server error" });
  }
});



/* ======================
   Start server
   ====================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
