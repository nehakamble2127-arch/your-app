const mongoose = require('mongoose');

const GroupMessageSchema = new mongoose.Schema(
  {
    groupId: { type: String, required: true },
    from: { type: String, required: true },
    text: { type: String, default: '' },
    time: { type: String, default: () => new Date().toISOString() },
  },
  { timestamps: true, collection: 'groupmessages' }
);

module.exports = mongoose.model('GroupMessage', GroupMessageSchema);
