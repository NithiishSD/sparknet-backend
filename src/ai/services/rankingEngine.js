/**
 * Feed Ranking Engine [SparkNet AI Layer — Phase 8]
 *
 * Implements a deterministic scoring algorithm combining engagement, 
 * hybrid interest mapping (cosine similarity), recency decay, and safety multipliers.
 */

import UserBehaviorProfile from '../../models/UserBehaviorProfile.js';

// Hyperparameter weights for the scoring formula
const WEIGHTS = {
  ENGAGEMENT: 1.0,
  INTEREST:   1.5,
  RECENCY:    1.2,
  SAFETY_PEN: 2.0
};

// Half-life for Recency Decay (in hours)
const RECENCY_HALF_LIFE = 24.0;

/**
 * Computes cosine-like interest similarity
 */
const computeInterestSimilarity = (postTags, userWeights) => {
  if (!postTags || postTags.length === 0 || !userWeights || Object.keys(userWeights).length === 0) {
    return 0;
  }
  let score = 0;
  postTags.forEach(tag => {
    const lowerTag = tag.toLowerCase();
    if (userWeights[lowerTag]) {
      score += userWeights[lowerTag];
    }
  });
  // Cap at 1.0
  return Math.min(score, 1.0);
};

/**
 * Score a batch of posts using the hybrid intelligence formula
 *
 * @param {Array} posts - Array of post documents (must include risk_score, likeCount, etc.)
 * @param {String} viewerId - ID of the user viewing the feed
 * @returns {Array} Array of scored and sorted post objects
 */
export const rankContentFeed = async (posts, viewerId) => {
  // 1. Fetch the Hybrid Behavior Profile
  let userProfile = null;
  if (viewerId) {
    userProfile = await UserBehaviorProfile.findOne({ userId: viewerId }).lean();
  }
  
  const interestWeights = userProfile?.interestWeights || {};
  const isColdStart = Object.keys(interestWeights).length === 0;

  // 2. Score each post
  const scoredPosts = posts.map(post => {
    // A. Engagement (Logarithmic Normalize)
    const engagementScore = Math.log1p((post.likeCount || 0) + ((post.commentCount || 0) * 1.5));
    
    // B. Recency (Exponential Decay)
    const ageHours = (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60 * 60);
    const recencyScore = Math.pow(0.5, ageHours / RECENCY_HALF_LIFE);
    
    // C. Interest Similarity
    const similarityScore = computeInterestSimilarity(post.tags, interestWeights);
    
    // D. Apply Weights (Dynamically adjust if Cold Start)
    let wE = WEIGHTS.ENGAGEMENT;
    let wR = WEIGHTS.RECENCY;
    let wI = WEIGHTS.INTEREST;

    if (isColdStart) {
      wE = 1.5; // Amplify Trending
      wR = 1.5; // Amplify Breaking Novelty
      wI = 0.0; // Math.min edge case wrapper
    }

    // E. Evaluate Formula
    const baseScore = (engagementScore * wE) + (similarityScore * wI) + (recencyScore * wR);
    
    // F. Severe Safety Penalties
    let finalScore = baseScore;
    if (post.risk_score > 0) {
      // Exponential penalty mapping (e.g. 0.8 risk -> heavily penalized)
      const penaltyAmount = Math.pow(post.risk_score, 2) * WEIGHTS.SAFETY_PEN;
      finalScore -= penaltyAmount;
    }

    return {
      ...post,
      _feedScore: Math.max(0, finalScore)
    };
  });

  // 3. Sort strictly by final score
  return scoredPosts.sort((a, b) => b._feedScore - a._feedScore);
};
