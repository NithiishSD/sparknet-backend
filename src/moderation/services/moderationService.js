/**
 * Moderation Service  [SparkNet Content System — Step 3]
 *
 * Simulates an AI/NLP moderation pipeline.
 * Designed as an independent module so it can be swapped out for
 * an external ML service (e.g. OpenAI, Perspective API) later.
 */

// Basic keyword dictionary with associated risk weights.
// In a real system, this would be backed by ML models.
const TOXIC_PATTERNS = [
  { word: 'violence', weight: 0.8, category: 'violence' },
  { word: 'kill',     weight: 0.9, category: 'violence' },
  { word: 'spam',     weight: 0.5, category: 'spam' },
  { word: 'hate',     weight: 0.7, category: 'hate_speech' },
  { word: 'idiot',    weight: 0.4, category: 'harassment' },
  { word: 'stupid',   weight: 0.3, category: 'harassment' },
  { word: 'abuse',    weight: 0.8, category: 'harassment' }
];

/**
 * Determine risk level label based on raw score.
 * Low: Safe for everyone
 * Medium: Blocked for youth, flagged for adults
 * High: Blocked for everyone
 */
const getRiskLevel = (score) => {
  if (score < 0.3) return 'low';
  if (score < 0.8) return 'medium';
  return 'high';
};

/**
 * Main Content Moderation Pipeline
 * Process: Content check → Risk scoring → Decision (Flag/Level)
 *
 * @param {String} text - text to analyze
 * @returns {Object} moderation results
 */
export const analyzeContent = async (text) => {
  // Simulate network latency for future ML API
  await new Promise(resolve => setTimeout(resolve, 150));

  if (!text) {
    return {
      riskScore: 0,
      riskLevel: 'low',
      isFlagged: false,
      categories: [],
      remark: "Clean content"
    };
  }

  const lowerText = text.toLowerCase();
  
  let totalRisk = 0;
  let matches = [];
  const categories = new Set();

  for (const pattern of TOXIC_PATTERNS) {
    if (lowerText.includes(pattern.word)) {
      totalRisk += pattern.weight;
      matches.push(pattern.word);
      categories.add(pattern.category);
    }
  }

  // Cap risk score at 1.0
  const riskScore = Math.min(totalRisk, 1.0);
  const riskLevel = getRiskLevel(riskScore);
  
  // Flag anything medium or high
  const isFlagged = riskLevel === 'medium' || riskLevel === 'high';

  let remark = isFlagged 
    ? `Flagged for potential harmful content (matched: ${matches.join(', ')})`
    : "Content cleared";

  return {
    riskScore,
    riskLevel,
    isFlagged,
    categories: Array.from(categories),
    remark
  };
};

/**
 * Calculate trust penalty based on content risk.
 * Higher risk drops trust score significantly.
 * 
 * @param {Number} currentTrustScore - user's current score
 * @param {Number} riskScore - raw risk score of the content
 */
export const applyTrustPenalty = (currentTrustScore, riskScore) => {
  if (riskScore < 0.3) return currentTrustScore;
  
  // e.g. 0.8 * 20 = 16 points deducted
  const penalty = Math.floor(riskScore * 20); 
  return Math.max(0, currentTrustScore - penalty);
};
