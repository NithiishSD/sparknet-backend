/**
 * Connection Service  [SparkNet Youth Safety — Step 4]
 * 
 * Manages Follows and Connections.
 */
import Connection from '../../models/Connection.js';

/**
 * Checks if a follower is connected to a target user.
 * For normal users, this usually just checks if the follow exists.
 * For strict scenarios, checks if status is 'accepted'.
 *
 * @param {String} followerId 
 * @param {String} targetId 
 * @returns {Boolean}
 */
export const isFollowing = async (followerId, targetId) => {
  if (followerId.toString() === targetId.toString()) return true;

  const conn = await Connection.findOne({
    follower: followerId,
    following: targetId,
    status: 'accepted'
  }).lean();

  return !!conn;
};

/**
 * Checks if two users have a MUTUAL connection (friendship).
 * Critical for youth safety interaction controls.
 *
 * @param {String} userA
 * @param {String} userB
 * @returns {Boolean}
 */
export const areMutuallyConnected = async (userA, userB) => {
  if (userA.toString() === userB.toString()) return true;

  const [aFollowsB, bFollowsA] = await Promise.all([
    Connection.exists({ follower: userA, following: userB, status: 'accepted' }),
    Connection.exists({ follower: userB, following: userA, status: 'accepted' })
  ]);

  return !!aFollowsB && !!bFollowsA;
};

/**
 * Verifies if a user is safely allowed to interact with a post.
 * Rule: Youth accounts can only interact with mutual connections, OR if they are following 
 * a trusted verified creator (for demo simplicity, we'll enforce mutual connection for youth).
 *
 * @param {String} viewerId 
 * @param {String} viewerRole 
 * @param {String} postCreatorId 
 * @returns {Boolean}
 */
export const canInteractWithUser = async (viewerId, viewerRole, postCreatorId) => {
  if (viewerId.toString() === postCreatorId.toString()) return true;

  if (viewerRole === 'child') {
    // strict youth rule: mutual connections only
    return await areMutuallyConnected(viewerId, postCreatorId);
  }

  // Adult users can interact freely (unless blocked, but we'll ignore blocking for now)
  return true;
};
