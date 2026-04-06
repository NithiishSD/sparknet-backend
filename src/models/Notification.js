import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: { 
    type: String, 
    enum: ['like', 'comment', 'reply', 'follow', 'mention', 'system', 'challenge_invite', 'milestone', 'report_update', 'message'],
    required: true
  },
  content: { type: String, required: true },
  referenceId: { type: mongoose.Schema.Types.ObjectId, refPath: 'referenceModel' },
  referenceModel: { type: String, enum: ['Post', 'Comment', 'Challenge', 'User', 'Message', 'Report'] },
  isRead: { type: Boolean, default: false },
}, { timestamps: true });

// Optimize query for fetching user's unread notifications
notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });
// Optimize query for fetching ALL user notifications (paginated)
notificationSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model('Notification', notificationSchema);
