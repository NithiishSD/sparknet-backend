/**
 * Screen Time Service [SparkNet — Parent Control System]
 *
 * Manages the full lifecycle of child session tracking:
 *   1. Open a session on socket connect
 *   2. Close a session on socket disconnect / logout
 *   3. Periodically poll active sessions against the guardian's limit
 *   4. If limit is exceeded → emit SESSION_TERMINATED via WebSocket and close the session
 *
 * Design decisions:
 * - Sessions are stored in MongoDB (ScreenTimeSession) so data survives server restarts
 *   and can be queried by the guardian dashboard.
 * - The polling interval is 60 seconds. This means a child may overshoot their limit
 *   by up to 1 minute — an acceptable tradeoff vs. real-time overhead.
 * - All DB operations that fail must not crash the socket handler. Errors are logged only.
 */

import ScreenTimeSession from '../models/ScreenTimeSession.js';
import ActivityLog, { ACTIVITY_TYPES } from '../models/ActivityLog.js';
import User from '../models/User.js';
import appEvents, { EVENTS } from '../events/eventEmitter.js';
import { emitToUser } from '../sockets/socketManager.js';

// Active polling timers keyed by userId string
// { userId: NodeJS.Timer }
const activePollers = new Map();

// ─── Session Lifecycle ────────────────────────────────────────────────────────

/**
 * Open a new screen time session for a child when their socket connects.
 * Returns the session document (used to close it later).
 *
 * @param {String} userId
 * @returns {Promise<Document>} ScreenTimeSession document
 */
export const openSession = async (userId) => {
  try {
    const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'

    // Close any stale active sessions (e.g. server restart left them open)
    await ScreenTimeSession.updateMany(
      { userId, sessionEnd: null },
      { $set: { sessionEnd: new Date(), durationMinutes: 0 } }
    );

    const session = await ScreenTimeSession.create({
      userId,
      sessionStart: new Date(),
      sessionEnd: null,
      date: today,
    });

    // Log the login event
    await ActivityLog.log(ACTIVITY_TYPES.LOGIN, userId);

    return session;
  } catch (err) {
    console.error('[screenTimeService -> openSession]', err.message);
    return null;
  }
};

/**
 * Close the screen time session when a child's socket disconnects or they log out.
 * Stops the polling timer and writes final duration to DB.
 *
 * @param {String} userId
 * @param {String} sessionId - _id of the ScreenTimeSession document opened at connect
 */
export const closeSession = async (userId, sessionId) => {
  try {
    // Stop the poller for this user
    stopPoller(userId);

    if (sessionId) {
      const session = await ScreenTimeSession.findById(sessionId);
      if (session && !session.sessionEnd) {
        await session.closeSession();
      }
    }

    // Log the logout event
    await ActivityLog.log(ACTIVITY_TYPES.LOGOUT, userId);
  } catch (err) {
    console.error('[screenTimeService -> closeSession]', err.message);
  }
};

// ─── Real-Time Enforcement Poller ─────────────────────────────────────────────

/**
 * Start a 60-second polling loop for a child user.
 * On each tick:
 *   1. Fetch today's total minutes from ScreenTimeSession.getTodayTotal()
 *   2. Fetch the guardian's screen time limit for this child
 *   3. If usage >= limit → terminate the session via WebSocket
 *
 * @param {String} userId
 * @param {String} sessionId
 */
export const startPoller = (userId, sessionId) => {
  // Don't double-start a poller for the same user
  if (activePollers.has(userId)) return;

  const timer = setInterval(async () => {
    try {
      const usedToday = await ScreenTimeSession.getTodayTotal(userId);

      // Fetch controls from guardian
      const guardianDoc = await User.findOne({ 'childLinks.childId': userId })
        .select('_id childLinks')
        .lean();

      if (!guardianDoc) return; // No guardian linked — no limit to enforce

      const link = guardianDoc.childLinks.find(
        (cl) => cl.childId.toString() === userId.toString()
      );

      if (!link?.controls?.screenTimeEnabled) return; // Screen time enforcement off

      const limitMinutes = link.controls.screenTimeLimitMinutes ?? 120;

      if (usedToday >= limitMinutes) {
        console.log(`[screenTimeService] Limit reached for user ${userId}: ${usedToday}/${limitMinutes} min`);

        // 1. Close the session in DB immediately
        await closeSession(userId, sessionId);

        // 2. Emit SESSION_TERMINATED to the child's live socket
        emitToUser(userId, 'SESSION_TERMINATED', {
          reason: 'screen_time_limit_reached',
          usedMinutes: usedToday,
          limitMinutes,
          message: `You have reached your daily screen time limit of ${limitMinutes} minutes.`,
        });

        // 3. Fire GUARDIAN_ALERT so parent gets notified
        appEvents.emit(EVENTS.GUARDIAN_ALERT, {
          guardianId: guardianDoc._id,
          childId: userId,
          alertType: 'screen_time_exceeded',
          usedMinutes: usedToday,
          limitMinutes,
        });

        // 4. Log violation
        ActivityLog.log(
          ACTIVITY_TYPES.GUARDIAN_RULE_VIOLATED,
          userId,
          null,
          null,
          { blockedReason: 'screen_time_exceeded', usedMinutes: usedToday, limitMinutes }
        );
      }
    } catch (err) {
      console.error('[screenTimeService -> poller tick]', err.message);
    }
  }, 60_000); // Poll every 60 seconds

  activePollers.set(userId, timer);
};

/**
 * Stop the poller for a user (on disconnect / session close).
 * @param {String} userId
 */
const stopPoller = (userId) => {
  const timer = activePollers.get(userId);
  if (timer) {
    clearInterval(timer);
    activePollers.delete(userId);
  }
};
