/**
 * Interaction Controller  [SparkNet Content System — Step 1]
 *
 * Handles: Like, Unlike, Comment, Reply, Delete Comment, Save, Unsave
 *
 * Key design decision:
 *   When a like/comment/save happens, we atomically increment the
 *   denormalized counter on the Post document using $inc.
 *   This keeps feed ranking fast (no aggregation needed on read).
 */

import Comment   from '../../models/Comment.js';
import Reaction  from '../../models/Reaction.js';
import SavedPost from '../../models/SavedPost.js';
import Post      from '../../models/Post.js';
import { canInteractWithUser } from '../../users/services/connectionService.js';
import appEvents, { EVENTS } from '../../events/eventEmitter.js';
import ActivityLog, { ACTIVITY_TYPES } from '../../models/ActivityLog.js';

// ─────────────────────────────────────────────────────────────────────────────
// LIKE POST
// POST /api/v1/posts/react  { postId }
// ─────────────────────────────────────────────────────────────────────────────
export const likePost = async (req, res) => {
  try {
    const { postId } = req.body;
    const userId     = req.user._id;

    if (!postId) {
      return res.status(400).json({ success: false, message: 'postId is required' });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    // Youth users cannot interact with medium/high risk posts
    if (req.user.role === 'child' && post.risk_score >= 0.3) {
      return res.status(403).json({ success: false, message: 'Interaction restricted for this content' });
    }

    // Step 4: Youth Safety - Check connections/followers
    const canInteract = await canInteractWithUser(userId, req.user.role, post.user);
    if (!canInteract) {
      return res.status(403).json({ success: false, message: 'You can only interact with users you are connected to.' });
    }

    // Prevent duplicate likes
    const existing = await Reaction.findOne({ user: userId, post: postId, type: 'like' });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Post already liked' });
    }

    // Create reaction + update counter atomically
    await Promise.all([
      Reaction.create({ user: userId, post: postId, type: 'like' }),
      Post.findByIdAndUpdate(postId, { $inc: { likeCount: 1 } }),
    ]);

    // Push notification (Decoupled Stage)
    if (post.user.toString() !== userId.toString()) {
      appEvents.emit(EVENTS.USER_LIKED_POST, {
        user: post.user,
        sender: userId,
        postId: postId,
        senderName: req.user.username
      });
    }

    return res.status(200).json({ success: true, message: 'Post liked' });
  } catch (error) {
    console.error('[likePost]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UNLIKE POST
// DELETE /api/v1/posts/:id/react
// ─────────────────────────────────────────────────────────────────────────────
export const unlikePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user._id;

    const deleted = await Reaction.findOneAndDelete({ user: userId, post: postId, type: 'like' });
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Like not found' });
    }

    // Decrement counter (floor at 0)
    await Post.findByIdAndUpdate(postId, { $inc: { likeCount: -1 } });

    // Emit counter-measure cleanup event
    const post = await Post.findById(postId).select('user');
    if (post) {
      appEvents.emit(EVENTS.USER_UNLIKED_POST, {
        user: post.user,
        sender: userId,
        postId: postId
      });
    }

    return res.status(200).json({ success: true, message: 'Post unliked' });
  } catch (error) {
    console.error('[unlikePost]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADD COMMENT
// POST /api/v1/posts/comment  { postId, content }
// ─────────────────────────────────────────────────────────────────────────────
export const addComment = async (req, res) => {
  try {
    const { postId, content } = req.body;
    const userId = req.user._id;

    if (!postId || !content?.trim()) {
      return res.status(400).json({ success: false, message: 'postId and content are required' });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    // Youth safety: no comments on medium+ risk content
    if (req.user.role === 'child' && post.risk_score >= 0.3) {
      return res.status(403).json({ success: false, message: 'Commenting restricted for this post' });
    }

    // Step 4: Youth Safety - Check connections/followers
    const canInteract = await canInteractWithUser(userId, req.user.role, post.user);
    if (!canInteract) {
      return res.status(403).json({ success: false, message: 'You can only interact with users you are connected to.' });
    }

    const [newComment] = await Promise.all([
      Comment.create({ post: postId, user: userId, content: content.trim() }),
      Post.findByIdAndUpdate(postId, { $inc: { commentCount: 1 } }),
    ]);

    await newComment.populate('user', 'username oauthAvatarUrl');

    if (req.user.role === 'child') {
      ActivityLog.log(ACTIVITY_TYPES.COMMENT_ADDED, userId, newComment._id, 'Comment');
    }

    // Push notification (Decoupled Stage)
    if (post.user.toString() !== userId.toString()) {
      appEvents.emit(EVENTS.USER_COMMENTED, {
        user: post.user,
        sender: userId,
        postId: postId,
        senderName: req.user.username,
        snippet: content.substring(0, 30)
      });
    }

    return res.status(201).json({ success: true, comment: newComment });
  } catch (error) {
    console.error('[addComment]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// REPLY TO COMMENT (nested)
// POST /api/v1/posts/comments/:commentId/reply  { content }
// ─────────────────────────────────────────────────────────────────────────────
export const replyToComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { content }   = req.body;
    const userId        = req.user._id;

    if (!content?.trim()) {
      return res.status(400).json({ success: false, message: 'Reply content is required' });
    }

    const parent = await Comment.findById(commentId);
    if (!parent) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    // Replies don't increment commentCount — they branch off the parent
    const reply = await Comment.create({
      post:          parent.post,
      user:          userId,
      content:       content.trim(),
      parentComment: commentId,
    });

    await reply.populate('user', 'username oauthAvatarUrl');

    return res.status(201).json({ success: true, comment: reply });
  } catch (error) {
    console.error('[replyToComment]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE COMMENT
// DELETE /api/v1/posts/comments/:commentId
// ─────────────────────────────────────────────────────────────────────────────
export const deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId        = req.user._id;
    const userRole      = req.user.role;

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    const isOwner = comment.user.toString() === userId.toString();
    if (!isOwner && userRole !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this comment' });
    }

    // Cascade delete: remove this comment + all its replies
    const [deletedCount] = await Promise.all([
      Comment.countDocuments({ parentComment: commentId }),
      Comment.findByIdAndDelete(commentId),
      Comment.deleteMany({ parentComment: commentId }),
    ]);

    // Decrement comment counter (top-level comments only)
    if (!comment.parentComment) {
      await Post.findByIdAndUpdate(comment.post, {
        $inc: { commentCount: -(1 + deletedCount) },
      });
    }

    return res.status(200).json({ success: true, message: 'Comment deleted' });
  } catch (error) {
    console.error('[deleteComment]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SAVE POST
// POST /api/v1/posts/:id/save
// ─────────────────────────────────────────────────────────────────────────────
export const savePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user._id;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const existing = await SavedPost.findOne({ user: userId, post: postId });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Post already saved' });
    }

    await Promise.all([
      SavedPost.create({ user: userId, post: postId }),
      Post.findByIdAndUpdate(postId, { $inc: { saveCount: 1 } }),
    ]);

    return res.status(200).json({ success: true, message: 'Post saved' });
  } catch (error) {
    console.error('[savePost]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UNSAVE POST
// DELETE /api/v1/posts/:id/save
// ─────────────────────────────────────────────────────────────────────────────
export const unsavePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user._id;

    const deleted = await SavedPost.findOneAndDelete({ user: userId, post: postId });
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Saved post not found' });
    }

    await Post.findByIdAndUpdate(postId, { $inc: { saveCount: -1 } });

    return res.status(200).json({ success: true, message: 'Post unsaved' });
  } catch (error) {
    console.error('[unsavePost]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};
