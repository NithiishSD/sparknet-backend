/**
 * Notification Controller [SparkNet — Step 8]
 * Handles fetching, reading, and clearing user notifications.
 */

import Notification from '../../models/Notification.js';

// ─────────────────────────────────────────────────────────────────────────────
// GET ALL NOTIFICATIONS (Paginated)
// GET /api/v1/notifications
// ─────────────────────────────────────────────────────────────────────────────
export const getNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find({ user: userId })
        .populate('sender', 'username oauthAvatarUrl role')
        .sort({ isRead: 1, createdAt: -1 }) // unread first, then newest
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments({ user: userId }),
      Notification.countDocuments({ user: userId, isRead: false }),
    ]);

    return res.status(200).json({
      success: true,
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      notifications
    });
  } catch (error) {
    console.error('[getNotifications]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// MARK SINGLE NOTIFICATION AS READ
// PATCH /api/v1/notifications/:id/read
// ─────────────────────────────────────────────────────────────────────────────
export const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, user: userId },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    return res.status(200).json({ success: true, notification });
  } catch (error) {
    console.error('[markAsRead]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// MARK ALL NOTIFICATIONS AS READ
// POST /api/v1/notifications/read-all
// ─────────────────────────────────────────────────────────────────────────────
export const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user._id;

    await Notification.updateMany(
      { user: userId, isRead: false },
      { isRead: true }
    );

    return res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('[markAllAsRead]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE NOTIFICATION
// DELETE /api/v1/notifications/:id
// ─────────────────────────────────────────────────────────────────────────────
export const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findOneAndDelete({ _id: id, user: userId });

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    return res.status(200).json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    console.error('[deleteNotification]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET UNREAD COUNT FAST META
// GET /api/v1/notifications/unread-count
// ─────────────────────────────────────────────────────────────────────────────
export const getUnreadCount = async (req, res) => {
  try {
    const unreadCount = await Notification.countDocuments({ user: req.user._id, isRead: false });
    return res.status(200).json({ success: true, unreadCount });
  } catch (error) {
    console.error('[getUnreadCount]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};
