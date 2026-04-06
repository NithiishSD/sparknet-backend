/**
 * AI Recommendation Engine [SparkNet AI Layer — Phase 8]
 *
 * Surfaces personalized content and users to follow.
 * Strongly enforces Parent Bounds before querying.
 */

import Post from '../../models/Post.js';
import User from '../../models/User.js';
import UserBehaviorProfile from '../../models/UserBehaviorProfile.js';
import { rankContentFeed } from './rankingEngine.js';

// Matches feedService thresholds
const RISK_THRESHOLDS = {
  SAFE: 0.3,
  MEDIUM: 0.5,
  HIGH: 0.8
};

/**
 * Generate Post Recommendations for the Explore Page
 */
export const recommendExploreContent = async (viewerId, userRole, guardianRules = {}, limit = 20) => {
  // 1. Establish the Hard Bounds (Req 7: Parent Integration)
  const query = {
    visibility: 'public',
    is_flagged: false
  };

  if (userRole === 'child') {
    const parentLevel = guardianRules.contentLevel || 'strict';
    let maxRisk = RISK_THRESHOLDS.SAFE;
    if (parentLevel === 'moderate') maxRisk = RISK_THRESHOLDS.MEDIUM;
    else if (parentLevel === 'relaxed') maxRisk = RISK_THRESHOLDS.HIGH;
    
    query.risk_score = { $lt: maxRisk };
  }

  // 2. Fetch User Profile for personalization 
  let profile = null;
  if (viewerId) {
    profile = await UserBehaviorProfile.findOne({ userId: viewerId }).lean();
  }

  const interestWeights = profile?.interestWeights || {};
  const isColdStart = Object.keys(interestWeights).length === 0;

  // 3. Dynamic Querying 
  if (!isColdStart) {
    // Determine Top 3 interests locally
    const topInterests = Object.keys(interestWeights)
      .sort((a, b) => interestWeights[b] - interestWeights[a])
      .slice(0, 3);
      
    if (topInterests.length > 0) {
      // Find posts containing user's top tags
      query.tags = { $in: topInterests };
    }
  } else {
    // Req 9: Cold Start Strategy - rely on global Engagement
    // We don't filter by tags, we just demand minimum engagement heuristics
    query.likeCount = { $gte: 5 }; // Minimum trending threshold
  }

  // 4. Fetch Candidates
  const candidates = await Post.find(query)
    .populate('user', 'username oauthAvatarUrl role trustScore')
    .sort({ createdAt: -1 })
    .limit(limit * 3) // over-fetch for scoring pool
    .lean();

  // 5. Pipe into the Ranking Engine
  const rankedFeed = await rankContentFeed(candidates, viewerId);
  
  // Return precise slice
  return rankedFeed.slice(0, limit);
};

/**
 * Suggest Users to Follow based on recommended content
 */
export const recommendUsersToFollow = async (viewerId, userRole, guardianRules = {}, limit = 5) => {
  // Leverage the explore content logic to find deeply safe, relevant posts
  const recommendedPosts = await recommendExploreContent(viewerId, userRole, guardianRules, 30);
  
  const creatorScores = {};
  
  recommendedPosts.forEach(post => {
    // Skip self
    if (post.user._id.toString() === viewerId.toString()) return;
    
    // Accumulate points for authors who produce content the viewer would like
    const uId = post.user._id.toString();
    creatorScores[uId] = (creatorScores[uId] || 0) + post._feedScore;
  });

  // Sort and pick top user IDs
  const topCreatorIds = Object.keys(creatorScores)
    .sort((a, b) => creatorScores[b] - creatorScores[a])
    .slice(0, limit);

  if (topCreatorIds.length === 0) return [];

  // Hydrate user documents
  const suggestedUsers = await User.find({ _id: { $in: topCreatorIds } })
    .select('username oauthAvatarUrl role bio')
    .lean();
    
  return suggestedUsers;
};
