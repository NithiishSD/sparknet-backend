/**
 * Interaction Read Controller  [SparkNet Content System — Step 2]
 *
 * All READ endpoints for interactions:
 *   GET /api/v1/posts/:id/comments        → getComments
 *   GET /api/v1/posts/:id/comments/:cid/replies → getReplies
 *   GET /api/v1/posts/:id/likes           → getLikeStatus
 *   GET /api/v1/posts/saved               → getSavedPosts
 */

import Post      from '../../models/Post.js';
import Reaction  from '../../models/Reaction.js';
import SavedPost from '../../models/SavedPost.js';
import { getPostComments, getCommentReplies } from '../services/commentService.js';

// ─────────────────────────────────────────────────────────────────────────────
// GET COMMENTS FOR A POST  (threaded, paginated)
// GET /api/v1/posts/:id/comments?page=1&limit=15
// ─────────────────────────────────────────────────────────────────────────────
export const getComments = async (req, res) => {
  try {
    const postId = req.params.id;
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, parseInt(req.query.limit) || 15);

    // Verify post exists + check viewer access
    const post = await Post.findById(postId).lean();
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    // Youth users cannot view comments on flagged/risky posts
    if (req.user.role === 'child' && post.risk_score >= 0.3) {
      return res.status(403).json({ success: false, message: 'Comments not available for this content' });
    }

    const { comments, pagination } = await getPostComments({
      postId,
      page,
      limit,
      viewerRole: req.user.role,
    });

    return res.status(200).json({ success: true, pagination, comments });
  } catch (error) {
    console.error('[getComments]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET REPLIES FOR A SPECIFIC COMMENT  (load more)
// GET /api/v1/posts/:id/comments/:commentId/replies?page=1&limit=10
// ─────────────────────────────────────────────────────────────────────────────
export const getReplies = async (req, res) => {
  try {
    const { commentId } = req.params;
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);

    const { replies, pagination } = await getCommentReplies({ commentId, page, limit });

    return res.status(200).json({ success: true, pagination, replies });
  } catch (error) {
    console.error('[getReplies]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET LIKE STATUS + COUNT FOR A POST
// GET /api/v1/posts/:id/likes
// Returns: { likeCount, likedByMe }
// ─────────────────────────────────────────────────────────────────────────────
export const getLikeStatus = async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user._id;

    const [post, userReaction] = await Promise.all([
      Post.findById(postId).select('likeCount').lean(),
      Reaction.findOne({ user: userId, post: postId, type: 'like' }).lean(),
    ]);

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    return res.status(200).json({
      success: true,
      likeCount:  post.likeCount || 0,
      likedByMe:  !!userReaction,
    });
  } catch (error) {
    console.error('[getLikeStatus]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET SAVED POSTS FOR CURRENT USER  (paginated)
// GET /api/v1/posts/saved?page=1&limit=20
// ─────────────────────────────────────────────────────────────────────────────
export const getSavedPosts = async (req, res) => {
  try {
    const userId = req.user._id;
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, parseInt(req.query.limit) || 20);
    const skip   = (page - 1) * limit;

    const [savedDocs, total] = await Promise.all([
      SavedPost.find({ user: userId })
        .populate({
          path:     'post',
          select:   'content_text media_url tags visibility likeCount commentCount risk_score createdAt user',
          populate: { path: 'user', select: 'username oauthAvatarUrl role' },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SavedPost.countDocuments({ user: userId }),
    ]);

    // Filter out deleted posts (post ref could be null if post was deleted)
    const posts = savedDocs
      .filter((s) => s.post !== null)
      .map((s) => ({
        savedAt: s.createdAt,
        ...s.post,
      }));

    // Youth: filter out any risky saved posts (edge case — shouldn't be saved
    // in the first place, but defensive filter here)
    const safePosts = req.user.role === 'child'
      ? posts.filter((p) => (p.risk_score || 0) < 0.3)
      : posts;

    return res.status(200).json({
      success: true,
      pagination: {
        page,
        limit,
        total,
        totalPages:  Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
      posts: safePosts,
    });
  } catch (error) {
    console.error('[getSavedPosts]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};
