/**
 * Behavior Engine Processor [SparkNet AI Layer — Phase 8]
 *
 * Reads flat activity arrays and applies Hybrid Interest Algorithms and Risk Classifications.
 */

import UserBehaviorProfile from '../../models/UserBehaviorProfile.js';
import { ACTIVITY_TYPES } from '../../models/ActivityLog.js';

/**
 * Bulk maps recent log interactions into UserBehaviorProfiles
 */
export const processActivityLogs = async (logs) => {
  // Group logs by user for unified atomic transactions
  const userBatches = {};
  
  for (const log of logs) {
    if (!userBatches[log.userId]) {
      userBatches[log.userId] = { 
        interestUpdates: {}, 
        newFlags: new Set(),
        anomalies: 0 
      };
    }
    
    const batch = userBatches[log.userId];

    // 1. Hybrid Interest Mapping (Based on Interactions)
    if (log.referenceId && Array.isArray(log.referenceId.tags)) {
      let weightBoost = 0;
      switch (log.activityType) {
        case ACTIVITY_TYPES.LIKE_GIVEN: weightBoost = 0.2; break;
        case ACTIVITY_TYPES.COMMENT_ADDED: weightBoost = 0.3; break;
        case ACTIVITY_TYPES.POST_SAVED: weightBoost = 0.4; break;
        case ACTIVITY_TYPES.POST_CREATED: weightBoost = 0.5; break;
      }
      
      if (weightBoost > 0) {
        log.referenceId.tags.forEach(tag => {
          const lowerTag = tag.toLowerCase();
          batch.interestUpdates[lowerTag] = (batch.interestUpdates[lowerTag] || 0) + weightBoost;
        });
      }
    }

    // 2. Anomaly & Rule Violation Detection
    if (log.activityType === ACTIVITY_TYPES.GUARDIAN_RULE_VIOLATED) {
      batch.anomalies++;
      if (log.metadata?.blockedReason === 'screen_time_exceeded') {
        batch.newFlags.add('frequent_screen_time_violations');
      }
      if (log.metadata?.blockedReason === 'messaging_contact_not_approved') {
        batch.newFlags.add('frequent_unsafe_messaging');
      }
    }
    
    if (log.activityType === ACTIVITY_TYPES.FLAGGED_CONTENT_VIEWED) {
      batch.anomalies++;
      batch.newFlags.add('interaction_with_flagged_content');
    }

    // Usage pattern detection
    const hour = new Date(log.createdAt).getHours();
    if (hour >= 23 || hour <= 4) batch.newFlags.add('night_owl_activity');
  }

  // Commit updates efficiently using Promise.all
  const promises = Object.keys(userBatches).map(async (userId) => {
    const batch = userBatches[userId];
    
    // Fetch or create profile
    let profile = await UserBehaviorProfile.findOne({ userId });
    if (!profile) {
      profile = new UserBehaviorProfile({ userId, interestWeights: {}, flags: [] });
    }

    // Apply incremental interest updates with a cap
    const currentInterests = profile.get('interestWeights') || new Map();
    Object.keys(batch.interestUpdates).forEach(tag => {
      let currentScore = currentInterests.get(tag) || 0;
      currentInterests.set(tag, Math.min(currentScore + batch.interestUpdates[tag], 1.0));
    });
    profile.set('interestWeights', currentInterests);

    // ── 3. Update Semantic Interest Embedding ───────────
    // Alpha controls how quickly the user's "taste" shifts.
    const ALPHA = 0.1; 
    
    // Find all post embeddings from this batch's interactions
    const postEmbeddings = logs
      .filter(l => l.userId.toString() === userId && l.referenceModel === 'Post' && l.referenceId?.embedding?.length > 0)
      .map(l => l.referenceId.embedding);

    if (postEmbeddings.length > 0) {
      let currentEmbedding = profile.interestEmbedding || [];
      
      for (const newVector of postEmbeddings) {
        if (currentEmbedding.length === 0) {
          currentEmbedding = [...newVector];
          continue;
        }
        // Weighted Moving Average: (Old * (1-Alpha)) + (New * Alpha)
        currentEmbedding = currentEmbedding.map((val, i) => 
          (val * (1 - ALPHA)) + (newVector[i] * ALPHA)
        );
      }
      profile.interestEmbedding = currentEmbedding;
    }

    // Append discrete flags
    const currentFlags = new Set(profile.flags);
    batch.newFlags.forEach(f => currentFlags.add(f));
    profile.flags = Array.from(currentFlags);

    // Escalate risk level based on aggregated anomalies
    if (batch.anomalies >= 3) profile.riskLevel = 'HIGH';
    else if (batch.anomalies === 2) profile.riskLevel = 'MEDIUM';
    
    if (profile.flags.includes('night_owl_activity')) {
      profile.usagePattern = 'night_owl';
    }

    return profile.save();
  });

  await Promise.all(promises);
};
