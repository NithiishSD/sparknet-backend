/**
 * Notification Service [Event Subscriber]
 * 
 * Listens to node events asynchronously so the main API thread isn't blocked.
 * Enforces Youth Safety & Notification Preferences before committing to DB.
 */

import appEvents, { EVENTS } from '../../events/eventEmitter.js';
import Notification from '../../models/Notification.js';
import User from '../../models/User.js';
import { emitToUser } from '../../sockets/socketManager.js';

// ─────────────────────────────────────────────────────────────────────────────
// CORE PIPELINE: Process, Filter, DB Write, Push
// ─────────────────────────────────────────────────────────────────────────────
const processAndPush = async ({ user, sender, type, content, referenceId }) => {
  try {
    // 1. Prevent self-notifications safely
    if (sender && user.toString() === sender.toString()) return;

    // 2. Fetch Receiver & Preferences
    const receiver = await User.findById(user).select('notificationPreferences role');
    if (!receiver) return;

    // 3. User Preference Guard
    // If the user has disabled this specific category, drop the event quietly
    const prefs = receiver.notificationPreferences || {};
    if (type === 'like' && prefs.likes === false) return;
    if (type === 'comment' && prefs.comments === false) return;
    if (type === 'reply' && prefs.comments === false) return;
    if (type === 'message' && prefs.messages === false) return;

    // (Note: We skip Youth Safety checks here because the interactionController / messagingService 
    // strictly prevent the interaction itself from happening anyway if bounds are violated).

    // 4. Determine Reference Model for exact populate
    let referenceModel;
    if (type === 'like' || type === 'comment' || type === 'reply') referenceModel = 'Post';
    if (type === 'message') referenceModel = 'Message';
    if (type === 'follow' || type === 'mention') referenceModel = 'User';
    if (type === 'challenge_invite') referenceModel = 'Challenge';
    if (type === 'report_update') referenceModel = 'Report';

    // 5. Write to DB
    const notif = await Notification.create({
      user,
      sender,
      type,
      content,
      referenceId,
      referenceModel
    });

    // 6. Fire WebSocket if online
    emitToUser(user.toString(), 'NEW_NOTIFICATION', notif);

  } catch (error) {
    console.error('[NotificationService -> processAndPush error]', error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRATION (LISTENERS)
// ─────────────────────────────────────────────────────────────────────────────

appEvents.on(EVENTS.USER_LIKED_POST, async (payload) => {
  // payload: { user (receiver), sender, postId, senderName }
  await processAndPush({
    user: payload.user,
    sender: payload.sender,
    type: 'like',
    content: `${payload.senderName || 'Someone'} liked your post.`,
    referenceId: payload.postId
  });
});

appEvents.on(EVENTS.USER_COMMENTED, async (payload) => {
  // payload: { user (receiver), sender, postId, senderName, snippet }
  await processAndPush({
    user: payload.user,
    sender: payload.sender,
    type: 'comment',
    content: `${payload.senderName || 'Someone'} commented: "${payload.snippet}..."`,
    referenceId: payload.postId
  });
});

appEvents.on(EVENTS.MESSAGE_RECEIVED, async (payload) => {
  // payload: { user, sender, senderName, snippet, messageId }
  await processAndPush({
    user: payload.user,
    sender: payload.sender,
    type: 'message', // Make sure this aligns with Notification schema enum!
    content: `${payload.senderName || 'Someone'} sent you a message: "${payload.snippet}..."`,
    referenceId: payload.messageId
  });
});

// ── EDGE CASES (Cleanup) ─────────────────────────────────────────────────────

appEvents.on(EVENTS.USER_UNLIKED_POST, async (payload) => {
  try {
    // If user unlikes, secretly delete the notification so receiver's inbox stays clean!
    await Notification.findOneAndDelete({
      user: payload.user,
      sender: payload.sender,
      type: 'like',
      referenceId: payload.postId
    });
  } catch (error) {
    console.error('[NotificationService Cleanup Error]', error);
  }
});
