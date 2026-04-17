import mongoose from 'mongoose';

const postSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content_text: {
    type: String,
    trim: true,
    maxlength: 2000,
    default: ''
  },
  media_url: {
    type: String,
    default: null
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  visibility: {
    type: String,
    enum: ['public', 'followers', 'private'],
    default: 'public'
  },

  // ── Engagement Counters (denormalized for feed performance) ──────────────
  // Updated atomically by interaction handlers via $inc.
  // Avoids expensive aggregation JOINs on every feed request.
  likeCount:    { type: Number, default: 0, min: 0 },
  commentCount: { type: Number, default: 0, min: 0 },
  saveCount:    { type: Number, default: 0, min: 0 },
  reportCount:  { type: Number, default: 0, min: 0 },

  // ── Safety & Moderation Fields ───────────────────────────────────────────
  is_flagged:        { type: Boolean, default: false },
  risk_score:        { type: Number,  default: 0, min: 0, max: 1 },
  safety_score:      { type: Number,  default: 0, min: 0, max: 1 },
  safety_label:      { type: String,  default: 'SAFE' },
  moderation_remark: { type: String,  default: null },
  editedAt:          { type: Date,    default: null },

  // ── AI Embedding (Semantic Vector) ───────────────────────────────────────
  // 1536-dimensional vector from Google Gemini (text-embedding-004)
  embedding: {
    type: [Number],
    default: [],
    select: false // Avoid sending large vectors to frontend unless needed
  },

}, { timestamps: true });

// ── Indexes ──────────────────────────────────────────────────────────────────
// Profile page: all posts by user, newest first
postSchema.index({ user: 1, createdAt: -1 });
// Main feed: public + safe content, newest first
postSchema.index({ visibility: 1, is_flagged: 1, createdAt: -1 });
// Admin moderation queue
postSchema.index({ is_flagged: 1, createdAt: -1 });
// Tag-based search
postSchema.index({ tags: 1 });

export default mongoose.model('Post', postSchema);