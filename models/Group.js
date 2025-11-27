const mongoose = require('mongoose');

const GroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    creatorId: { type: String, required: true },
    participants: { type: [String], default: [] },
    lastMessage: {
      senderId: String,
      text: String,
      createdAt: Date,
    },
    lastUpdated: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Group', GroupSchema);
