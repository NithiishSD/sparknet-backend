import mongoose from 'mongoose';

const connectionSchema = new mongoose.Schema({
  follower: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  following: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // For youth accounts, guardian settings might require reciprocal approval
  // i.e., "friend requests" instead of just public following.
  // We'll track 'status' to allow for pending requests.
  status: {
    type: String,
    enum: ['pending', 'accepted', 'blocked'],
    default: 'accepted'
  }
}, { timestamps: true });

// Prevent duplicate connections
connectionSchema.index({ follower: 1, following: 1 }, { unique: true });
// Optimize reverse lookups (who follows me?)
connectionSchema.index({ following: 1, status: 1 });

export default mongoose.model('Connection', connectionSchema);
