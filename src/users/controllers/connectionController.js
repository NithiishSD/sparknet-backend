/**
 * Connection Controller [SparkNet Youth Safety]
 * Handles Follows and Connection requests.
 */
import Connection from '../../models/Connection.js';
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
