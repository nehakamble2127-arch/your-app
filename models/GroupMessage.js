const mongoose = require('mongoose');

const GroupMessageSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    senderId: { type: String, required: true },
    text: { type: String, default: '' },
    attachments: { type: Array, default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('GroupMessage', GroupMessageSchema);
