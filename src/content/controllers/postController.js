/**
 * Post Controller  [SparkNet Content System — Step 1]
 *
 * Thin controller layer — only handles HTTP concerns (parse req, call service,
 * send res). All business logic lives in the service layer.
 *
 * Routes handled:
 *   POST   /api/v1/posts/create          → createPost
 *   GET    /api/v1/posts/feed            → getFeed
 *   GET    /api/v1/posts/:id             → getSinglePost
 *   PUT    /api/v1/posts/:id             → editPost
 *   DELETE /api/v1/posts/:id             → deletePost
 *   GET    /api/v1/posts/user/:userId    → getUserPosts
 */

import Post from '../../models/Post.js';
import User from '../../models/User.js';
import { applyTrustPenalty } from '../../moderation/services/moderationService.js';
import { classifyContentSafety as analyzeContent } from '../../ai/services/safetyEngine.js';
import { buildFeed, getUserPostsFeed } from '../services/feedService.js';
import ActivityLog, { ACTIVITY_TYPES } from '../../models/ActivityLog.js';

// ─────────────────────────────────────────────────────────────────────────────
// CREATE POST
// POST /api/v1/posts/create
// ─────────────────────────────────────────────────────────────────────────────
export const createPost = async (req, res) => {
  try {
    const { content_text: incoming_text, content: fallback_text, visibility, tags } = req.body;
    let { media_url } = req.body;
    
    // Resolve content_text (fallback to 'content' if provided)
    const content_text = incoming_text || fallback_text;
    
    // If a file was uploaded via Cloudinary middleware
    if (req.file) {
      media_url = req.file.path;
    }

    const userId   = req.user._id;
    const userRole = req.user.role;

    // ── 1. Validate required fields ────────────────────────────────────────
    if (!content_text?.trim()) {
      return res.status(400).json({ success: false, message: 'Post content is required' });
    }

    // ── 2. Content Moderation pipeline ────────────────────────────────────
    const moderation  = await analyzeContent(content_text);
    const risk_score  = moderation.riskScore;
    const is_flagged  = moderation.isFlagged;

    // Apply trust penalty to author if content was flagged
    if (is_flagged) {
      await User.findByIdAndUpdate(userId, {
        $inc: { trustScore: -applyTrustPenalty(0, risk_score) },
      });
    }

    // Block high-risk content for ALL users
    if (risk_score >= 0.8) {
      return res.status(403).json({
        success: false,
        message: 'Post blocked: content violates safety guidelines.',
        code: 'HIGH_RISK_CONTENT',
      });
    }

    // ── 3. Youth Safety enforcement ────────────────────────────────────────
    let finalVisibility = visibility || 'public';
    if (userRole === 'child') {
      finalVisibility = 'followers';       // youth posts always followers-only
      if (risk_score >= 0.5) {
        return res.status(403).json({
          success: false,
          message: 'Post blocked: does not meet youth safety guidelines.',
          code: 'YOUTH_SAFETY_VIOLATION',
        });
      }
    }

    // ── 4. Validate visibility enum ────────────────────────────────────────
    if (!['public', 'followers', 'private'].includes(finalVisibility)) {
      finalVisibility = 'public';
    }

    // ── 5. Create & save post ──────────────────────────────────────────────
    const newPost = await Post.create({
      user: userId,
      content_text: content_text.trim(),
      media_url:    media_url || null,
      tags:         Array.isArray(tags) ? tags : [],
      visibility:   finalVisibility,
      risk_score,
      is_flagged,
      moderation_remark: moderation.remark || null,
    });

    // Populate user for response
    await newPost.populate('user', 'username oauthAvatarUrl role');

    // ── 6. Activity Logging for Youth Monitoring ──
    if (userRole === 'child') {
      ActivityLog.log(
        ACTIVITY_TYPES.POST_CREATED, 
        userId, 
        newPost._id, 
        'Post', 
        { riskScore: risk_score }
      );
    }

    return res.status(201).json({
      success: true,
      message: is_flagged
        ? 'Post submitted and queued for moderation review'
        : 'Post created successfully',
      post: newPost,
    });

  } catch (error) {
    console.error('[createPost]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET FEED  (ranked, paginated)
// GET /api/v1/posts/feed?page=1&limit=20
// ─────────────────────────────────────────────────────────────────────────────
export const getFeed = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    
    // Guardian's requested comfort level (attached by middleware)
    const contentLevel = req._childControls?.controls?.contentLevel || 'strict';

    const { posts, pagination } = await buildFeed({
      userId:   req.user._id.toString(),
      userRole: req.user.role,
      userInterests: req.user.interests || [],
      contentLevel,
      page,
      limit,
    });

    return res.status(200).json({
      success: true,
      pagination,
      posts,
    });
  } catch (error) {
    console.error('[getFeed]', error);
    return res.status(500).json({ success: false, message: 'Error fetching feed', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET SINGLE POST
// GET /api/v1/posts/:id
// ─────────────────────────────────────────────────────────────────────────────
export const getSinglePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('user', 'username oauthAvatarUrl role trustScore');

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    // Visibility access check
    const isOwner = post.user._id.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (post.visibility === 'private' && !isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Youth users cannot view flagged content
    if (req.user.role === 'child' && post.is_flagged) {
      return res.status(403).json({ success: false, message: 'Content not available' });
    }

    return res.status(200).json({ success: true, post });
  } catch (error) {
    console.error('[getSinglePost]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// EDIT POST
// PUT /api/v1/posts/:id
// ─────────────────────────────────────────────────────────────────────────────
export const editPost = async (req, res) => {
  try {
    const { content_text: incoming_text, content: fallback_text, tags, visibility } = req.body;
    const content_text = incoming_text || fallback_text;
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    // Only owner or admin can edit
    const isOwner = post.user.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to edit this post' });
    }

    // Re-moderate if content changed
    if (content_text?.trim()) {
      const moderation = await analyzeContent(content_text);
      post.risk_score        = moderation.riskScore;
      post.is_flagged        = moderation.isFlagged;
      post.moderation_remark = moderation.remark || null;
      post.content_text      = content_text.trim();

      // Block if violates safety after edit
      const youthBlock = req.user.role === 'child' && moderation.riskScore >= 0.5;
      if (moderation.riskScore >= 0.8 || youthBlock) {
        return res.status(403).json({
          success: false,
          message: 'Edit blocked: updated content violates safety guidelines.',
          code: 'EDIT_CONTENT_VIOLATION',
        });
      }
    }

    if (tags !== undefined)     post.tags = Array.isArray(tags) ? tags : [];
    // Youth users cannot change their visibility setting
    if (visibility && req.user.role !== 'child') {
      if (['public', 'followers', 'private'].includes(visibility)) {
        post.visibility = visibility;
      }
    }

    await post.save();
    await post.populate('user', 'username oauthAvatarUrl role');

    return res.status(200).json({ success: true, post });
  } catch (error) {
    console.error('[editPost]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE POST
// DELETE /api/v1/posts/:id
// ─────────────────────────────────────────────────────────────────────────────
export const deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const isOwner = post.user.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this post' });
    }

    await Post.findByIdAndDelete(req.params.id);

    return res.status(200).json({ success: true, message: 'Post deleted successfully' });
  } catch (error) {
    console.error('[deletePost]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET USER POSTS  (profile page feed)
// GET /api/v1/posts/user/:userId?page=1&limit=20
// ─────────────────────────────────────────────────────────────────────────────
export const getUserPosts = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);

    const { posts, pagination } = await getUserPostsFeed({
      targetUserId: req.params.userId,
      viewerUserId: req.user?._id?.toString(),
      viewerRole:   req.user?.role,
      page,
      limit,
    });

    return res.status(200).json({ success: true, pagination, posts });
  } catch (error) {
    console.error('[getUserPosts]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};