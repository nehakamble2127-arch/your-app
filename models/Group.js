// models/Message.js
const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', index: true, required: false }, // optional for DMs
  from: { type: String, required: true },
  text: { type: String, required: true },
  time: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Message', MessageSchema);
