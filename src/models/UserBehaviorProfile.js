/**
 * UserBehaviorProfile Model [SparkNet AI Layer — Phase 8]
 *
 * Dedicated collection for tracking User Interests and Behavior without 
 * locking up the main User collection. Processed asynchronously by a background worker.
 */

import mongoose from 'mongoose';

const userBehaviorProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

    // Hybrid Interest Model: keys are explicit Post Tags or Topics.
    // values are numerical weights indicating affinity (e.g., {"sports": 0.8, "tech": 0.5})
    interestWeights: {
      type: Map,
      of: Number,
      default: {},
    },

    // AI Classification Output
    usagePattern: {
      type: String,
      enum: ['standard', 'night_owl', 'hyper_active', 'dormant'],
      default: 'standard',
    },

    // Risk indicator based on anomalies (flagged content views, rejected messages)
    riskLevel: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH'],
      default: 'LOW',
    },

    // Store discrete behavioral red flags for Parent Dashboard / Admins
    flags: [{
      type: String,
      trim: true,
    }],
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('UserBehaviorProfile', userBehaviorProfileSchema);
