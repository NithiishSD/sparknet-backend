/**
 * Feed Service  [SparkNet Content System — Step 1]
 *
 * Responsible for:
 *  1. Fetching candidate posts from MongoDB
 *  2. Applying visibility / safety filters (role-aware)
 *  3. Ranking posts via a modular scoring function
 *  4. Returning paginated results
 *
 * Architecture note:
 *  This is a pure service layer — no req/res knowledge.
 *  Swap the rankPost() function with an ML model later without
 *  touching the controller or route.
 */

import Post from '../../models/Post.js';
import { rankContentFeed } from '../../ai/services/rankingEngine.js';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const FEED_PAGE_SIZE = 20;

// Risk thresholds (matches moderationService.js)
const RISK_THRESHOLDS = {
  SAFE:   0.3,   // below this → always show
  MEDIUM: 0.5,   // youth users blocked here
  HIGH:   0.8,   // all users blocked here
};

// ─────────────────────────────────────────────────────────────────────────────
// RANKING ENGINE
//
// Feed Score = recency + engagement + trust bonus – risk penalty
//
// This is intentionally simple and modular.
// To plug in an ML model later: replace rankPost() with an async call
// to your recommendation API — the rest of the pipeline stays the same.
// ─────────────────────────────────────────────────────────────────────────────

// [LEGACY RANKING REMOVED]
// Replaced by advanced deterministic engine in ai/services/rankingEngine.js

// ─────────────────────────────────────────────────────────────────────────────
// MAIN FEED BUILDER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a paginated, ranked feed for a given user.
 *
 * @param {Object} options
 * @param {String} options.userId     - current user's _id (string)
 * @param {String} options.userRole   - 'child' | 'user' | 'admin'
 * @param {Number} options.page       - 1-indexed page number (default: 1)
 * @param {Number} options.limit      - results per page (default: FEED_PAGE_SIZE)
 * @param {Array<String>} options.userInterests - current user's interests
 *
 * @returns {Object} { posts, pagination }
 */
export const buildFeed = async ({
  userId,
  userRole,
  page  = 1,
  limit = FEED_PAGE_SIZE,
  userInterests = [],
  contentLevel = 'strict',
}) => {
  const skip = (page - 1) * limit;

  // ── Step 1: Build query filter ─────────────────────────────────────────────
  const query = {
    visibility: 'public',  // only public posts in the global feed
    is_flagged: false,     // never show flagged posts to end users
  };

  // Youth Safety Rule [SRS 5.5.3] + Parent Rule overriding:
  // Dynamically block content based on the Guardian's set contentLevel
  if (userRole === 'child') {
    let threshold = RISK_THRESHOLDS.SAFE; // 'strict' (default)
    if (contentLevel === 'moderate') threshold = RISK_THRESHOLDS.MEDIUM;
    else if (contentLevel === 'relaxed') threshold = RISK_THRESHOLDS.HIGH;
    
    query.risk_score = { $lt: threshold };
  }

  // ── Step 2: Fetch candidate posts from DB ─────────────────────────────────
  // We fetch 3× the page size as candidates to allow re-ranking.
  // After scoring, we slice to the requested page + limit.
  const candidateLimit = limit * 3;

  const rawPosts = await Post.find(query)
    .populate('user', 'username oauthAvatarUrl role trustScore')
    .sort({ createdAt: -1 })       // pre-sort by recency as baseline
    .skip(skip)
    .limit(candidateLimit)
    .lean();                       // plain JS objects — faster for scoring

  // ── Step 3: Rank each candidate ───────────────────────────────────────────
  // The rankContentFeed uses the UserBehaviorProfile for cosine similarity
  // and completely replaces the legacy loop math.
  const scoredPosts = await rankContentFeed(rawPosts, userId);

  // ── Step 5: Slice to requested page ───────────────────────────────────────
  const pagePosts = scoredPosts.slice(0, limit);

  // ── Step 6: Count total for pagination metadata ───────────────────────────
  const total = await Post.countDocuments(query);

  return {
    posts: pagePosts,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
  };
};

/**
 * Fetch all posts by a specific user (profile page).
 * Respects visibility rules based on who is viewing.
 *
 * @param {Object} options
 * @param {String} options.targetUserId   - whose posts to fetch
 * @param {String} options.viewerUserId   - who is viewing (null = public)
 * @param {String} options.viewerRole     - 'child' | 'user' | 'admin'
 * @param {Number} options.page
 * @param {Number} options.limit
 */
export const getUserPostsFeed = async ({
  targetUserId,
  viewerUserId,
  viewerRole,
  page  = 1,
  limit = FEED_PAGE_SIZE,
}) => {
  const skip = (page - 1) * limit;
  const isSelf  = viewerUserId && viewerUserId.toString() === targetUserId.toString();
  const isAdmin = viewerRole === 'admin';

  // Build visibility filter
  let visibilityFilter;
  if (isSelf || isAdmin) {
    visibilityFilter = { $in: ['public', 'followers', 'private'] }; // see all own posts
  } else {
    visibilityFilter = 'public'; // strangers only see public
  }

  const query = {
    user: targetUserId,
    visibility: visibilityFilter,
  };

  // Youth viewer cannot see flagged content
  if (viewerRole === 'child') {
    query.is_flagged = false;
    query.risk_score = { $lt: RISK_THRESHOLDS.SAFE };
  }

  const [posts, total] = await Promise.all([
    Post.find(query)
      .populate('user', 'username oauthAvatarUrl role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Post.countDocuments(query),
  ]);

  return {
    posts,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
  };
};
