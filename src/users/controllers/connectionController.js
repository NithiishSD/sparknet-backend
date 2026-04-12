/**
 * Connection Controller [SparkNet Youth Safety]
 * Handles Follows, Connection requests, and Account Blocking.
 */
import Connection from '../../models/Connection.js';
import Block from '../../models/Block.js';
import User from '../../models/User.js';

export const followUser = async (req, res) => {
  try {
    const followerId = req.user._id;
    const { targetId } = req.body;

    if (followerId.toString() === targetId.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot follow yourself' });
    }

    const targetUser = await User.findById(targetId);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Check if already connected
    const existingConn = await Connection.findOne({ follower: followerId, following: targetId });
    if (existingConn) {
      return res.status(400).json({ success: false, message: 'Already requested or following' });
    }

    // Strict Connections logic for youth: If either user is a child, it might require 'pending' logic.
    // For simplicity, we set it to accepted immediately for this demo, 
    // unless we implement the exact friend request flow later.
    const isStrict = req.user.role === 'child' || targetUser.role === 'child';
    const initialStatus = isStrict ? 'accepted' : 'accepted'; // Mocking auto-accept but highlighting where 'pending' logic goes

    await Connection.create({ follower: followerId, following: targetId, status: initialStatus });

    res.status(200).json({ success: true, message: `Successfully followed ${targetUser.username}` });
  } catch (error) {
    console.error('[followUser]', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const unfollowUser = async (req, res) => {
  try {
    const followerId = req.user._id;
    const { targetId } = req.params;

    const deleted = await Connection.findOneAndDelete({ follower: followerId, following: targetId });
    
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Connection not found' });
    }

    res.status(200).json({ success: true, message: 'Unfollowed successfully' });
  } catch (error) {
    console.error('[unfollowUser]', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getFollowers = async (req, res) => {
  try {
    const { targetId } = req.params;
    const connections = await Connection.find({ following: targetId, status: 'accepted' })
      .populate('follower', 'username oauthAvatarUrl role');
    
    res.status(200).json({ success: true, followers: connections.map(c => c.follower) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/users/following
// Returns all users the authenticated user is currently following.
// Used by the messaging page to build a contacts sidebar.
// ─────────────────────────────────────────────────────────────────────────────
export const getFollowing = async (req, res) => {
  try {
    const connections = await Connection.find({
      follower: req.user._id,
      status: 'accepted',
    }).populate('following', 'username oauthAvatarUrl role');

    const following = connections.map((c) => c.following);

    res.status(200).json({ success: true, following, count: following.length });
  } catch (error) {
    console.error('[getFollowing]', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/users/block/:userId
// Block a user: creates Block record + removes any mutual connections.
// ─────────────────────────────────────────────────────────────────────────────
export const blockUser = async (req, res) => {
  try {
    const blockerId = req.user._id;
    const targetId  = req.params.userId;

    if (blockerId.toString() === targetId.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot block yourself' });
    }

    const target = await User.findById(targetId).select('_id username');
    if (!target) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Upsert block (idempotent — blocking twice is not an error)
    await Block.findOneAndUpdate(
      { blocker: blockerId, blocked: targetId },
      { blocker: blockerId, blocked: targetId },
      { upsert: true, new: true }
    );

    // Remove follow relationship in both directions so the block is clean
    await Connection.deleteMany({
      $or: [
        { follower: blockerId, following: targetId },
        { follower: targetId, following: blockerId },
      ],
    });

    return res.status(200).json({ success: true, message: `${target.username} has been blocked` });
  } catch (error) {
    console.error('[blockUser]', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/users/block/:userId
// Unblock a user. Connections are NOT automatically restored.
// ─────────────────────────────────────────────────────────────────────────────
export const unblockUser = async (req, res) => {
  try {
    const result = await Block.findOneAndDelete({
      blocker: req.user._id,
      blocked: req.params.userId,
    });

    if (!result) {
      return res.status(404).json({ success: false, message: 'Block record not found' });
    }

    return res.status(200).json({ success: true, message: 'User unblocked' });
  } catch (error) {
    console.error('[unblockUser]', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
