import mongoose from 'mongoose';

const reactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: true
  },
  type: {
    type: String,
    enum: ['like'],
    default: 'like'
  }
}, { timestamps: true });

// Prevent duplicate likes from the same user on the same post
reactionSchema.index({ user: 1, post: 1 }, { unique: true });

export default mongoose.model('Reaction', reactionSchema);
