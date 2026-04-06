/**
 * ActivityLog Model [SparkNet — Parent Control System]
 *
 * A time-series log of every significant action taken by a child account.
 * This is NOT the same as ActivitySummary.js (which is a per-user counter for gamification).
 *
 * Each action writes one document here. This collection powers the guardian
 * monitoring dashboard: what posts did my child create, what did they comment,
 * how much did they message, etc.
 *
 * Design choices:
 * - `referenceModel` enables dynamic Mongoose populate (same pattern as Notification.js).
 * - `metadata` is a flexible Mixed field for extra context (risk scores, flagged status, etc.)
 *   without requiring schema migrations every time we add a new activity type.
 * - Compound indexes are critical — this collection will be high-volume.
 */

import mongoose from 'mongoose';

// All activity types the system will log for child accounts
export const ACTIVITY_TYPES = {
  // Content
  POST_CREATED:    'post_created',
  POST_DELETED:    'post_deleted',
  COMMENT_ADDED:   'comment_added',
  COMMENT_DELETED: 'comment_deleted',
  LIKE_GIVEN:      'like_given',
  LIKE_REMOVED:    'like_removed',
  POST_SAVED:      'post_saved',

  // Messaging
  MESSAGE_SENT:    'message_sent',
  MESSAGE_BLOCKED: 'message_blocked', // attempted but blocked by guardian rule

  // Social
  FOLLOW_SENT:     'follow_sent',
  FOLLOW_ACCEPTED: 'follow_accepted',

  // Session
  LOGIN:           'login',
  LOGOUT:          'logout',

  // Safety events
  FLAGGED_CONTENT_VIEWED: 'flagged_content_viewed',
  GUARDIAN_RULE_VIOLATED: 'guardian_rule_violated',
};

const activityLogSchema = new mongoose.Schema(
  {
    // The child who performed this action
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Type of activity (from ACTIVITY_TYPES constants above)
    activityType: {
      type: String,
      enum: Object.values(ACTIVITY_TYPES),
      required: true,
    },

    // Polymorphic reference to the affected resource (Post, Comment, Message, User)
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'referenceModel',
    },
    referenceModel: {
      type: String,
      enum: ['Post', 'Comment', 'Message', 'User'],
    },

    // Flexible bag for extra context without schema migrations
    // Examples:
    //   { riskScore: 0.7, flagged: true }          → for viewed/interacted flagged content
    //   { blockedReason: 'messaging_disabled' }     → for guardian_rule_violated
    //   { recipientId: '...' }                      → for message_sent / message_blocked
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    // timestamps: true gives us createdAt automatically.
    // We deliberately don't need updatedAt — logs are immutable.
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Primary query: "get all activity for this child, newest first"
activityLogSchema.index({ userId: 1, createdAt: -1 });

// Filtered query: "get all posts/comments/messages for this child"
activityLogSchema.index({ userId: 1, activityType: 1, createdAt: -1 });

// ─── Static Helper ────────────────────────────────────────────────────────────

/**
 * Convenience static to write a log entry without boilerplate at each call site.
 *
 * Usage:
 *   await ActivityLog.log('post_created', userId, postId, 'Post', { riskScore: 0.1 });
 *
 * Fails silently — logging must never crash the main request pipeline.
 */
activityLogSchema.statics.log = async function (activityType, userId, referenceId, referenceModel, metadata = {}) {
  try {
    await this.create({ activityType, userId, referenceId, referenceModel, metadata });
  } catch (err) {
    console.error('[ActivityLog.log] Failed to write activity log:', err.message);
  }
};

export default mongoose.model('ActivityLog', activityLogSchema);
