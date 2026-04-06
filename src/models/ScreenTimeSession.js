/**
 * ScreenTimeSession Model [SparkNet — Parent Control System]
 *
 * Tracks real-time session durations for child accounts so guardians can:
 *   1. View daily and weekly usage summaries
 *   2. Enforce daily screen time limits set via childLinks[].controls
 *
 * Architecture:
 * - One document per session (socket connect → disconnect).
 * - `date` is a YYYY-MM-DD string for O(1) daily bucket lookups.
 * - `durationMinutes` is written on session close (logout / socket disconnect).
 * - A null `sessionEnd` indicates an ACTIVE session — critical for real-time enforcement.
 *
 * The screenTimeService reads this collection to:
 *   - Sum today's durationMinutes vs the guardian's set limit
 *   - Detect if the active session pushed the child over the limit
 *   - If over limit: emit SESSION_TERMINATED via WebSocket
 */

import mongoose from 'mongoose';

const screenTimeSessionSchema = new mongoose.Schema(
  {
    // The child account being tracked
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Socket-level session start (set on socket 'connection' event)
    sessionStart: {
      type: Date,
      required: true,
      default: Date.now,
    },

    // Set on disconnect / logout. null = session is still active.
    sessionEnd: {
      type: Date,
      default: null,
    },

    // Calculated and written when sessionEnd is set.
    // Stored as a number to make SUM aggregations trivially cheap.
    durationMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },

    // YYYY-MM-DD string for daily bucketing.
    // Stored as a string (not Date) to avoid timezone headaches in aggregation.
    // Always set to the LOCAL date at session start.
    date: {
      type: String,
      required: true,
    },
  },
  {
    // createdAt for audit trail, updatedAt for tracking the last time we wrote sessionEnd
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Primary: "all sessions for this child on this date" — used for daily total calculation
screenTimeSessionSchema.index({ userId: 1, date: 1 });

// Secondary: find active sessions quickly (sessionEnd = null means still active)
screenTimeSessionSchema.index({ userId: 1, sessionEnd: 1 });

// ─── Instance Method ──────────────────────────────────────────────────────────

/**
 * Close the session and calculate duration.
 * Call this on socket disconnect or explicit logout.
 */
screenTimeSessionSchema.methods.closeSession = async function () {
  this.sessionEnd = new Date();
  const diffMs = this.sessionEnd - this.sessionStart;
  this.durationMinutes = Math.round(diffMs / 60000); // ms → minutes
  return this.save();
};

// ─── Static Helpers ───────────────────────────────────────────────────────────

/**
 * Get total minutes used TODAY for a specific child.
 * Includes the active session's elapsed time (even if not yet closed).
 *
 * @param {String} userId
 * @returns {Number} totalMinutesToday
 */
screenTimeSessionSchema.statics.getTodayTotal = async function (userId) {
  const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'

  // Sum all closed sessions today
  const agg = await this.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId), date: today } },
    { $group: { _id: null, total: { $sum: '$durationMinutes' } } },
  ]);
  const closedMinutes = agg[0]?.total || 0;

  // Add elapsed time of any still-active session (sessionEnd = null)
  const activeSession = await this.findOne({ userId, date: today, sessionEnd: null });
  let activeMinutes = 0;
  if (activeSession) {
    const elapsedMs = Date.now() - activeSession.sessionStart.getTime();
    activeMinutes = Math.round(elapsedMs / 60000);
  }

  return closedMinutes + activeMinutes;
};

/**
 * Get daily totals for the last N days (for the guardian's weekly view).
 *
 * @param {String} userId
 * @param {Number} days
 * @returns {Array<{ date: String, totalMinutes: Number }>}
 */
screenTimeSessionSchema.statics.getWeeklySummary = async function (userId, days = 7) {
  const results = await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        // Only include closed sessions (durationMinutes is reliable)
        sessionEnd: { $ne: null },
      },
    },
    {
      $group: {
        _id: '$date',
        totalMinutes: { $sum: '$durationMinutes' },
      },
    },
    { $sort: { _id: -1 } },
    { $limit: days },
    { $project: { _id: 0, date: '$_id', totalMinutes: 1 } },
  ]);
  return results;
};

export default mongoose.model('ScreenTimeSession', screenTimeSessionSchema);
