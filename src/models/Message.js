import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  conversationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Conversation', 
    required: true 
  },
  senderId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  receiverId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  content: { 
    type: String, 
    required: true,
    trim: true
  },
  messageType: { 
    type: String, 
    enum: ['text', 'media'], 
    default: 'text' 
  },
  isRead: { 
    type: Boolean, 
    default: false 
  },
  // Security & Moderation flags
  isFlagged: { 
    type: Boolean, 
    default: false 
  },
  moderationRemark: { 
    type: String 
  }
}, { timestamps: true });

// Optimize query for fetching a conversation's history quickly
messageSchema.index({ conversationId: 1, createdAt: 1 });
// Optimize query for fetching unread badges
messageSchema.index({ receiverId: 1, isRead: 1 });

export default mongoose.model('Message', messageSchema);
