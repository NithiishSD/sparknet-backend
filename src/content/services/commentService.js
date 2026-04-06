/**
 * Comment Service  [SparkNet Content System — Step 2]
 *
 * Responsible for fetching paginated, threaded comments.
 *
 * Two-pass strategy:
 *   Pass 1 → Fetch top-level comments (parentComment: null), paginated
 *   Pass 2 → Fetch all replies for those comment IDs in a single query
 *   Then → Stitch replies onto their parent in memory
 *
 * This avoids N+1 queries (one query per parent comment) while keeping
 * the data structure clean for the frontend.
 */

import Comment from '../../models/Comment.js';

const COMMENT_PAGE_SIZE = 15;
const REPLY_LIMIT       = 5;   // max replies shown inline per comment

/**
 * Get paginated top-level comments for a post, with inline replies.
 *
 * @param {Object} opts
 * @param {String}  opts.postId     - Post _id
 * @param {Number}  opts.page       - 1-indexed page
 * @param {Number}  opts.limit      - comments per page
 * @param {String}  opts.viewerRole - for youth safety filtering
 * @returns {{ comments, pagination }}
 */
export const getPostComments = async ({
  postId,
  page         = 1,
  limit        = COMMENT_PAGE_SIZE,
  viewerRole   = 'user',
}) => {
  const skip = (page - 1) * limit;

  // ── Pass 1: top-level comments ────────────────────────────────────────────
  const [topLevel, total] = await Promise.all([
    Comment.find({ post: postId, parentComment: null })
      .populate('user', 'username oauthAvatarUrl role')
      .sort({ createdAt: 1 })   // oldest first — natural reading order
      .skip(skip)
      .limit(limit)
      .lean(),
    Comment.countDocuments({ post: postId, parentComment: null }),
  ]);

  if (topLevel.length === 0) {
    return {
      comments: [],
      pagination: buildPagination(page, limit, total),
    };
  }

  // ── Pass 2: fetch replies for all top-level comment IDs at once ───────────
  const parentIds = topLevel.map((c) => c._id);
  const allReplies = await Comment.find({ parentComment: { $in: parentIds } })
    .populate('user', 'username oauthAvatarUrl role')
    .sort({ createdAt: 1 })
    .lean();

  // ── Stitch replies onto parents (in memory) ───────────────────────────────
  const replyMap = {};
  for (const reply of allReplies) {
    const key = reply.parentComment.toString();
    if (!replyMap[key]) replyMap[key] = [];
    if (replyMap[key].length < REPLY_LIMIT) {
      replyMap[key].push(reply);
    }
  }

  const comments = topLevel.map((comment) => ({
    ...comment,
    replies:       replyMap[comment._id.toString()] || [],
    replyCount:    allReplies.filter(
      (r) => r.parentComment.toString() === comment._id.toString()
    ).length,
  }));

  return {
    comments,
    pagination: buildPagination(page, limit, total),
  };
};

/**
 * Get all replies for a specific comment (for "load more replies" flow).
 *
 * @param {Object} opts
 * @param {String} opts.commentId - parent comment _id
 * @param {Number} opts.page
 * @param {Number} opts.limit
 */
export const getCommentReplies = async ({
  commentId,
  page  = 1,
  limit = 10,
}) => {
  const skip = (page - 1) * limit;

  const [replies, total] = await Promise.all([
    Comment.find({ parentComment: commentId })
      .populate('user', 'username oauthAvatarUrl role')
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Comment.countDocuments({ parentComment: commentId }),
  ]);

  return {
    replies,
    pagination: buildPagination(page, limit, total),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function buildPagination(page, limit, total) {
  return {
    page,
    limit,
    total,
    totalPages:  Math.ceil(total / limit),
    hasNextPage: page * limit < total,
    hasPrevPage: page > 1,
  };
}
