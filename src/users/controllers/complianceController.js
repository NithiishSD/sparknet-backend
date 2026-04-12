/**
 * Compliance Controller  [SparkNet GDPR / Data Rights]
 *
 * Minimum compliance endpoints:
 *   GET    /api/user/export   → data export (right to portability)
 *   DELETE /api/user/account  → account deletion (right to erasure)
 */

import User from '../../models/User.js';
import Post from '../../models/Post.js';
import Message from '../../models/Message.js';
import Notification from '../../models/Notification.js';
import ActivityLog from '../../models/ActivityLog.js';

const { ACCOUNT_STATUS } = User;

// ─────────────────────────────────────────────────────────────────────────────
// DATA EXPORT  (Right to Portability)
// GET /api/user/export
// ─────────────────────────────────────────────────────────────────────────────
export const exportUserData = async (req, res) => {
  try {
    const userId = req.user._id;

    // Fetch user profile — omit sensitive auth fields
    const profile = await User.findById(userId)
      .select('-password -emailVerificationToken -emailVerificationExpires -passwordResetToken -passwordResetExpires -guardianInviteToken -guardianInviteExpires -sessions')
      .lean();

    if (!profile) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Gather all user-owned data in parallel
    const [posts, messages, notifications] = await Promise.all([
      Post.find({ user: userId }).lean(),
      Message.find({ $or: [{ senderId: userId }, { receiverId: userId }] }).lean(),
      Notification.find({ userId }).lean(),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      profile,
      posts,
      messages,
      notifications,
    };

    // Set download headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="sparknet-data.json"');

    return res.status(200).json(exportData);

  } catch (error) {
    console.error('[exportUserData]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNT DELETION  (Right to Erasure — anonymize + purge)
// DELETE /api/user/account
// ─────────────────────────────────────────────────────────────────────────────
export const deleteAccount = async (req, res) => {
  try {
    const userId = req.user._id;

    // ── 1. Anonymize user document (preserves referential integrity) ─────
    const user = await User.findById(userId).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.email    = `deleted_${userId}@removed.com`;
    user.username = `deleted_${userId}`;
    user.status   = ACCOUNT_STATUS.DELETED;
    user.password = undefined;

    // Clear PII fields
    user.oauthAvatarUrl        = null;
    user.dateOfBirth           = undefined;
    user.loginHistory          = [];
    user.sessions              = [];
    user.notificationPreferences = undefined;
    user.interests             = [];
    user.guardianInviteEmail   = undefined;

    await user.save({ validateBeforeSave: false });

    // ── 2. Purge user-generated content ─────────────────────────────────
    await Promise.all([
      Post.deleteMany({ user: userId }),
      Message.deleteMany({ $or: [{ senderId: userId }, { receiverId: userId }] }),
      Notification.deleteMany({ userId }),
      ActivityLog.deleteMany({ userId }),
    ]);

    // ── 3. Unlink from any parent/guardian accounts ─────────────────────
    await User.updateMany(
      { 'childLinks.childId': userId },
      { $pull: { childLinks: { childId: userId } } }
    );

    // Clear cookies so the client is logged out immediately
    res
      .clearCookie('accessToken')
      .clearCookie('refreshToken')
      .status(200)
      .json({ success: true, message: 'Account deleted and data purged' });

  } catch (error) {
    console.error('[deleteAccount]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};
