import mongoose from 'mongoose';

const challengeSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  points: { type: Number, default: 0 },
  icon: { type: String, default: '🏆' },
  category: { type: String, enum: ['creative', 'knowledge', 'coding', 'fitness', 'community'] },
  durationDays: { type: Number, default: 7 },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  leaderboard: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    score: { type: Number, default: 0 }
  }],
}, { timestamps: true });

export default mongoose.model('Challenge', challengeSchema);
