/**
 * Moderation Controller  [SparkNet Content System — Step 3]
 *
 * Exposes the moderation pipeline as API endpoints.
 */

import { analyzeContent } from '../services/moderationService.js';
import Post from '../../models/Post.js';

// ─────────────────────────────────────────────────────────────────────────────
// CHECK CONTENT (pre-flight check)
// POST /api/v1/moderation/check
//
// Allows the frontend to check if a post would be flagged before actually
// creating the post, giving the user a chance to edit.
// ─────────────────────────────────────────────────────────────────────────────
export const checkContent = async (req, res) => {
  try {
    const { content_text, content: fallback_content } = req.body;
    const final_content = content_text || fallback_content;

    if (!final_content) {
      return res.status(400).json({ success: false, message: 'Content text is required' });
    }

    const moderation = await analyzeContent(final_content);

    return res.status(200).json({
      success: true,
      safe: !moderation.isFlagged,
      riskLevel: moderation.riskLevel,
      remark: moderation.remark,
      categories: moderation.categories
    });
  } catch (error) {
    console.error('[checkContent]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET MODERATION QUEUE (Admin only)
// GET /api/v1/moderation/queue
//
// Fetches all posts that have been flagged by the AI for manual admin review.
// ─────────────────────────────────────────────────────────────────────────────
export const getModerationQueue = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const [flaggedPosts, total] = await Promise.all([
      Post.find({ is_flagged: true })
        .populate('user', 'username email role trustScore')
        .sort({ risk_score: -1, createdAt: -1 }) // highest risk first
        .skip(skip)
        .limit(limit)
        .lean(),
      Post.countDocuments({ is_flagged: true })
    ]);

    return res.status(200).json({
      success: true,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      posts: flaggedPosts
    });
  } catch (error) {
    console.error('[getModerationQueue]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// REVIEW FLAGGED POST (Admin only)
// PATCH /api/v1/moderation/:postId/resolve
//
// Admin decides to either keep the flag (block post) or clear it (approve post).
// ─────────────────────────────────────────────────────────────────────────────
export const resolveFlaggedPost = async (req, res) => {
  try {
    const { postId } = req.params;
    const { action } = req.body; // 'approve' or 'block'

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    if (action === 'approve') {
      post.is_flagged = false;
      post.risk_score = 0; // reset risk
      post.moderation_remark = 'Manually approved by admin';
    } else if (action === 'block') {
      // Logic could be to keep it flagged, or hard delete it.
      // We will keep it flagged but perhaps change visibility.
      post.is_flagged = true;
      post.visibility = 'private'; // effectively blocked from feed
      post.moderation_remark = 'Manually blocked by admin';
    } else {
      return res.status(400).json({ success: false, message: "Action must be 'approve' or 'block'" });
    }

    await post.save();

    return res.status(200).json({ success: true, message: `Post successfully ${action}d` });
  } catch (error) {
    console.error('[resolveFlaggedPost]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};
