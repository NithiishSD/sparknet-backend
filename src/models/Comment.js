import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  parentComment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    default: null // For threaded replies
  }
}, { timestamps: true });

// Optimizes querying comments for a specific post and threading
commentSchema.index({ post: 1, parentComment: 1, createdAt: 1 });

export default mongoose.model('Comment', commentSchema);