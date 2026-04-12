/**
 * Block Utilities [SparkNet — Account Safety]
 *
 * Pure helper functions — no req/res.
 * Import these wherever you need block-awareness:
 *   feed queries, profile views, interaction guards.
 */

import Block from '../models/Block.js';

/**
 * Check whether a block exists in EITHER direction between two users.
 * Returns true if viewerId blocked targetId OR targetId blocked viewerId.
 *
 * @param {String|ObjectId} viewerId
 * @param {String|ObjectId} targetId
 * @returns {Promise<Boolean>}
 */
export const isBlocked = async (viewerId, targetId) => {
  if (!viewerId || !targetId) return false;
  if (viewerId.toString() === targetId.toString()) return false;

  const count = await Block.countDocuments({
    $or: [
      { blocker: viewerId, blocked: targetId },
      { blocker: targetId, blocked: viewerId },
    ],
  });
  return count > 0;
};

/**
 * Get all user IDs that have a block relationship with the given user
 * (either direction). Use the returned array to filter queries with $nin.
 *
 * @param {String|ObjectId} userId
 * @returns {Promise<Array<ObjectId>>}
 */
export const getBlockedUserIds = async (userId) => {
  const blocks = await Block.find({
    $or: [{ blocker: userId }, { blocked: userId }],
  })
    .select('blocker blocked')
    .lean();

  return blocks.map((b) =>
    b.blocker.toString() === userId.toString() ? b.blocked : b.blocker
  );
};
