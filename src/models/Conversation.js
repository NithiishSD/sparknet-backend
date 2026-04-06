import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
  participants: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  }],
  lastMessage: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Message' 
  },
  // Used to track if a conversation is active or archived by users natively (optional extension)
  status: {
    type: String,
    enum: ['active', 'archived'],
    default: 'active'
  }
}, { timestamps: true });

// Optimize query for fetching a user's inbox sorted by recent activity
conversationSchema.index({ participants: 1, updatedAt: -1 });

export default mongoose.model('Conversation', conversationSchema);
