const express = require("express");
const router = express.Router();

const Group = require("../models/Group");
const GroupMessage = require("../models/GroupMessage");

// Create Group
router.post("/", async (req, res) => {
  try {
    const { name, creatorId, participants } = req.body;

    if (!name || !creatorId) {
      return res.status(400).json({ error: "name and creatorId required" });
    }

    const group = await Group.create({
      name,
      creatorId,
      participants: participants || [creatorId],
    });

    res.status(201).json({ message: "Group created", data: group });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send Message to Group
router.post("/:id/message", async (req, res) => {
  try {
    const groupId = req.params.id;
    const { senderId, text, attachments } = req.body;

    if (!senderId || (!text && !(attachments && attachments.length))) {
      return res.status(400).json({ error: "senderId and text required" });
    }

    const msg = await GroupMessage.create({
      groupId,
      senderId,
      text,
      attachments: attachments || [],
    });

    // Update group last message
    await Group.findByIdAndUpdate(groupId, {
      lastMessage: {
        senderId,
        text,
        createdAt: msg.createdAt,
      },
      lastUpdated: new Date(),
      $addToSet: { participants: senderId },
    });

    res.status(201).json({ message: "Message sent", data: msg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Group Messages
router.get("/:id/messages", async (req, res) => {
  try {
    const groupId = req.params.id;

    const messages = await GroupMessage.find({ groupId }).sort({
      createdAt: 1,
    });

    res.json({ data: messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
