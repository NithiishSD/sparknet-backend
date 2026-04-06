/**
 * ContentScore Model [SparkNet AI Layer — Phase 8]
 *
 * Dedicated collection for AI feed ranking.
 * Instead of heavily mutating the Post document on every like/comment,
 * we update this shadow document asynchronously, keeping the read queries
 * on the Feed extremely fast.
 */

import mongoose from 'mongoose';

const contentScoreSchema = new mongoose.Schema(
  {
    // The target post this score applies to
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: true,
      unique: true,
      index: true,
    },

    // Numeric base computed from interactions (likes, comments, views, saves)
    engagementScore: {
      type: Number,
      default: 0,
      index: true,
    },

    // 0.0 (Perfectly Safe) to 1.0 (Highly Toxic)
    safetyScore: {
      type: Number,
      default: 0,
    },

    // Enum representing categorical safety layer rules
    safetyLabel: {
      type: String,
      enum: ['SAFE', 'MODERATE', 'RISKY'],
      default: 'SAFE',
      index: true,
    },

    // Pre-computed master rank used to sort feeds instantly without live math
    finalScore: {
      type: Number,
      default: 0,
      index: -1,
    },
  },
  {
    // Important for tracking recency decay models later
    timestamps: true,
  }
);

// Indexes
// High performance index to quickly grab the safest and highest ranking posts
contentScoreSchema.index({ safetyLabel: 1, finalScore: -1 });

export default mongoose.model('ContentScore', contentScoreSchema);
