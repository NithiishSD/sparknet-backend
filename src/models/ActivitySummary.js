import mongoose from 'mongoose';

const activitySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  postCount: { type: Number, default: 0 },
  challengeCount: { type: Number, default: 0 },
  points: { type: Number, default: 0 },
  level: { type: Number, default: 1 }
}, { timestamps: true });

export default mongoose.model('ActivitySummary', activitySchema);