/**
 * enforceChildControls Middleware [SparkNet — Parent Control System]
 *
 * This is the centralized Safety Enforcement Engine.
 * It is a middleware FACTORY — you call it with a domain string to get
 * a specific enforcement middleware for that route type.
 *
 * Usage on routes:
 *   router.post('/send',    protect, enforceChildControls('messaging'), sendMessageAPI);
 *   router.get ('/feed',    protect, enforceChildControls('content'),   getFeed);
 *   router.post('/create',  protect, enforceChildControls('content'),   createPost);
 *   router.post('/comment', protect, enforceChildControls('content'),   addComment);
 *
 * Architecture:
 * - Only triggers for role === 'child'. Adult/admin requests pass through immediately.
 * - Fetches the child's guardian record ONCE per request and reads controls from there.
 * - Uses a short-lived cache via req (request object) to avoid duplicate DB hits
 *   if multiple middlewares call this on the same request.
 * - Logs all VIOLATIONS to ActivityLog (non-blocking, silent fail).
 * - Emits GUARDIAN_ALERT events for violations so parents get real-time notifications.
 */

import User from '../models/User.js';
import ScreenTimeSession from '../models/ScreenTimeSession.js';
import ActivityLog, { ACTIVITY_TYPES } from '../models/ActivityLog.js';
import appEvents, { EVENTS } from '../events/eventEmitter.js';

// ─── Internal Helper ──────────────────────────────────────────────────────────

/**
 * Fetch the child's controls from their guardian's childLinks array.
 * Caches the result on req._childControls to avoid re-querying on the same request.
 *
 * @param {Object} req - Express request object (req.user must be the child)
 * @returns {{ controls: Object, guardianId: ObjectId } | null}
 */
const getChildControls = async (req) => {
  // Cache hit — already fetched for this request
  if (req._childControls !== undefined) return req._childControls;

  const guardianDoc = await User.findOne({
    'childLinks.childId': req.user._id,
  })
    .select('_id childLinks')
    .lean();

  if (!guardianDoc) {
    req._childControls = null;
    return null;
  }

  const link = guardianDoc.childLinks.find(
    (cl) => cl.childId.toString() === req.user._id.toString()
  );

  req._childControls = link ? { controls: link.controls, guardianId: guardianDoc._id } : null;
  return req._childControls;
};

/**
 * Emit a guardian alert and write a violation log entry.
 * Both operations are fire-and-forget — they must never block the 403 response.
 */
const recordViolation = (req, blockedReason, guardianId) => {
  // Write violation to ActivityLog (non-blocking)
  ActivityLog.log(
    ACTIVITY_TYPES.GUARDIAN_RULE_VIOLATED,
    req.user._id,
    null,
    null,
    { blockedReason, route: req.originalUrl }
  );

  // Fire guardian alert event (non-blocking)
  if (guardianId) {
    appEvents.emit(EVENTS.GUARDIAN_ALERT, {
      guardianId,
      childId: req.user._id,
      childUsername: req.user.username,
      alertType: blockedReason,
      route: req.originalUrl,
    });
  }
};

// ─── Enforcement Domains ──────────────────────────────────────────────────────

/**
 * Enforce messaging rules:
 *  1. messaging must be enabled (master switch)
 *  2. if allowedMessagingContacts is non-empty, receiverId must be in the list
 */
const enforceMessaging = async (req, res, next) => {
  const result = await getChildControls(req);

  if (!result) return next(); // No guardian linked → apply default youth rules from connectionService

  const { controls, guardianId } = result;

  // Master switch
  if (!controls.messagingAllowed) {
    recordViolation(req, 'messaging_disabled', guardianId);
    return res.status(403).json({
      success: false,
      message: 'Messaging has been disabled by your guardian.',
      code: 'GUARDIAN_MESSAGING_DISABLED',
    });
  }

  // Allowlist check: only relevant when list is non-empty
  const allowlist = controls.allowedMessagingContacts || [];
  if (allowlist.length > 0) {
    // receiverId comes from the REST body or query depending on endpoint
    const targetId = (req.body.receiverId || req.params.receiverId || '').toString();
    const isPermitted = allowlist.map(String).includes(targetId);

    if (!isPermitted) {
      recordViolation(req, 'messaging_contact_not_approved', guardianId);
      return res.status(403).json({
        success: false,
        message: 'You can only message contacts approved by your guardian.',
        code: 'GUARDIAN_CONTACT_RESTRICTED',
      });
    }
  }

  next();
};

/**
 * Enforce content rules:
 *  1. Scheduled hours — block if current hour is outside the allowed window
 *  2. Screen time limit — block if today's usage has exceeded the limit
 *
 * NOTE: Risk-score based content filtering happens INSIDE the feed/post controllers
 * because they need the actual post data. We attach controls to req here so
 * controllers can read req._childControls.controls.contentLevel without re-fetching.
 */
const enforceContent = async (req, res, next) => {
  const result = await getChildControls(req);

  if (!result) return next();

  const { controls, guardianId } = result;

  // ── 1. Scheduled Hours Check ────────────────────────────────────────────────
  const currentHour = new Date().getHours(); // 0–23 in server local time
  const { scheduledHoursStart = 0, scheduledHoursEnd = 23 } = controls;

  // Handle overnight schedules (e.g. allowed 20:00 → 08:00 next day)
  const isWithinSchedule = scheduledHoursStart <= scheduledHoursEnd
    ? currentHour >= scheduledHoursStart && currentHour <= scheduledHoursEnd
    : currentHour >= scheduledHoursStart || currentHour <= scheduledHoursEnd;

  if (!isWithinSchedule) {
    recordViolation(req, 'outside_scheduled_hours', guardianId);
    return res.status(403).json({
      success: false,
      message: `Access is restricted to between ${scheduledHoursStart}:00 and ${scheduledHoursEnd}:00 by your guardian.`,
      code: 'GUARDIAN_SCHEDULE_RESTRICTED',
    });
  }

  // ── 2. Screen Time Check ────────────────────────────────────────────────────
  if (controls.screenTimeEnabled) {
    const usedToday = await ScreenTimeSession.getTodayTotal(req.user._id);
    if (usedToday >= controls.screenTimeLimitMinutes) {
      recordViolation(req, 'screen_time_exceeded', guardianId);
      return res.status(403).json({
        success: false,
        message: `You have reached your daily screen time limit of ${controls.screenTimeLimitMinutes} minutes.`,
        code: 'GUARDIAN_SCREEN_TIME_EXCEEDED',
        usedMinutes: usedToday,
        limitMinutes: controls.screenTimeLimitMinutes,
      });
    }
  }

  // Attach controls to req so downstream controllers (feed, post) can filter by contentLevel
  // without making a second DB call
  if (!req._childControls) req._childControls = result;

  next();
};

/**
 * Enforce friend/follow request rules.
 */
const enforceSocial = async (req, res, next) => {
  const result = await getChildControls(req);
  if (!result) return next();

  const { controls, guardianId } = result;

  if (!controls.friendRequestsAllowed) {
    recordViolation(req, 'friend_requests_disabled', guardianId);
    return res.status(403).json({
      success: false,
      message: 'Friend requests have been disabled by your guardian.',
      code: 'GUARDIAN_SOCIAL_RESTRICTED',
    });
  }

  next();
};

// ─── Middleware Factory ───────────────────────────────────────────────────────

/**
 * enforceChildControls(domain) — Factory function.
 *
 * Returns a middleware that:
 *   1. Passes non-child users through immediately (zero overhead for adults/admins)
 *   2. Fetches guardian controls (with request-level caching)
 *   3. Applies the domain-specific enforcement rules
 *   4. Logs violations and emits GUARDIAN_ALERT events
 *
 * @param {'messaging' | 'content' | 'social'} domain
 * @returns {Function} express middleware
 */
const enforceChildControls = (domain) => {
  return async (req, res, next) => {
    try {
      // Fast-path: only enforce for child accounts
      if (req.user?.role !== 'child') return next();

      switch (domain) {
        case 'messaging': return await enforceMessaging(req, res, next);
        case 'content':   return await enforceContent(req, res, next);
        case 'social':    return await enforceSocial(req, res, next);
        default:          return next();
      }
    } catch (err) {
      // Safety-first: if enforcement itself throws, log it and let the request continue
      // rather than blocking legitimate users due to a monitoring bug.
      console.error('[enforceChildControls] Enforcement error (non-blocking):', err.message);
      next();
    }
  };
};

export default enforceChildControls;
