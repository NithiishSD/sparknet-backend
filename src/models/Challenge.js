import mongoose from 'mongoose';

const challengeSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  points: { type: Number, default: 0 },
  icon: { type: String, default: '🏆' },
  category: { type: String, enum: ['creative', 'knowledge', 'coding', 'wellness', 'community'] },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  visibility: {
    type: String,
    enum: ['global', 'family'],
    default: 'global'
  },
  durationDays: {
    type: Number,
    default: 7
  },

  // ── Participants with AI scoring + vote scoring ───────────────────────
  participants: [{
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    entry:     { type: String, default: null },
    aiScore:   { type: Number, default: 0 },
    voteScore: { type: Number, default: 0 },
    score:     { type: Number, default: 0 },   // Final combined score (aiScore + voteScore)
    submittedAt: { type: Date },
  }],

  // ── Peer Voting ──────────────────────────────────────────────────────
  votes: [{
    voter:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    at:        { type: Date, default: Date.now },
  }],

  // ── Leaderboard (recomputed on each vote / submission) ───────────────
  leaderboard: [{
    user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    score:     { type: Number, default: 0 },
    aiScore:   { type: Number, default: 0 },
    voteScore: { type: Number, default: 0 },
  }],
}, { timestamps: true });

export default mongoose.model('Challenge', challengeSchema);
