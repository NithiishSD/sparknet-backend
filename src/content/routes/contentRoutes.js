/**
 * Content Routes  [SparkNet Content System — Step 1 & 2]
 *
 * ROUTE ORDERING RULE (Express):
 *   Static routes (/feed, /saved, /comment) MUST be declared before
 *   dynamic routes (/:id) to prevent Express matching them as an id.
 *
 * Base path: /api/v1/posts
 */

import express from 'express';

// Controllers — Write side
import {
  createPost,
  getFeed,
  editPost,
  deletePost,
  getSinglePost,
  getUserPosts,
} from '../controllers/postController.js';

import {
  likePost,
  unlikePost,
  addComment,
  replyToComment,
  deleteComment,
  savePost,
  unsavePost,
} from '../controllers/interactionController.js';

import { reportContent } from '../controllers/reportController.js';

// Controllers — Read side (Step 2)
import {
  getComments,
  getReplies,
  getLikeStatus,
  getSavedPosts,
} from '../controllers/interactionReadController.js';

import { protect } from '../../middleware/Auth.js';
import enforceChildControls from '../../middleware/enforceChildControls.js';
import { uploadPostMedia } from '../../utils/upload.js';

const router = express.Router();

// Shorthand — content enforcement checks scheduled hours + screen time for child accounts.
// Also attaches req._childControls.controls.contentLevel so feed/post controllers
// can filter by content level without a second DB call.
const guardContent = enforceChildControls('content');

// ─────────────────────────────────────────────────────────────────────────────
// STATIC ROUTES  (must be before /:id)
// ─────────────────────────────────────────────────────────────────────────────

// POST MANAGEMENT
router.post  ('/create', protect, guardContent, uploadPostMedia.single('media'), createPost);           // Create a post
router.get   ('/feed',   protect, guardContent, getFeed);              // Get ranked feed

// INTERACTION — static write
router.post  ('/react',   protect, guardContent, likePost);            // Like a post
router.post  ('/comment', protect, guardContent, addComment);          // Add comment
router.post  ('/report',  protect, reportContent);                     // Report (no content guard)

// INTERACTION — static read
router.get   ('/saved',   protect, guardContent, getSavedPosts);       // Get saved posts

// USER POSTS (profile page)
router.get   ('/user/:userId', protect, getUserPosts);                 // No content guard — summary view

// ─────────────────────────────────────────────────────────────────────────────
// COMMENT-SPECIFIC ROUTES  (before /:id to avoid collision)
// ─────────────────────────────────────────────────────────────────────────────
router.post  ('/comments/:commentId/reply',   protect, guardContent, replyToComment);
router.get   ('/comments/:commentId/replies', protect, guardContent, getReplies);
router.delete('/comments/:commentId',         protect, deleteComment);  // Delete own comment — no guard

// ─────────────────────────────────────────────────────────────────────────────
// DYNAMIC ROUTES  /:id  (after all static routes)
// ─────────────────────────────────────────────────────────────────────────────

// Post CRUD
router.get   ('/:id',  protect, guardContent, getSinglePost);         // View a single post
router.put   ('/:id',  protect, guardContent, editPost);              // Edit own post
router.delete('/:id',  protect, deletePost);                          // Delete own post — no guard

// Reactions & saves on a post
router.delete('/:id/react', protect, unlikePost);                     // Unlike — no content guard
router.post  ('/:id/save',  protect, guardContent, savePost);         // Save
router.delete('/:id/save',  protect, unsavePost);                     // Unsave

// Read — comments & likes on a post
router.get   ('/:id/comments',                        protect, guardContent, getComments);
router.get   ('/:id/comments/:commentId/replies',     protect, guardContent, getReplies);
router.get   ('/:id/likes',                           protect, guardContent, getLikeStatus);

export default router;