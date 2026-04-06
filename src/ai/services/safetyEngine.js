/**
 * AI Safety Engine [SparkNet AI Layer — Phase 8]
 * 
 * Maps raw inputs to standard AI metrics (safetyScore, safetyLabel).
 * Acts as an independent layer ready for external ML integrations.
 */

// Simulated weights for classification models
const TOXIC_PATTERNS = [
  { word: 'violence', weight: 0.8, category: 'violence' },
  { word: 'kill',     weight: 0.9, category: 'violence' },
  { word: 'spam',     weight: 0.5, category: 'spam' },
  { word: 'hate',     weight: 0.7, category: 'hate_speech' },
  { word: 'idiot',    weight: 0.4, category: 'harassment' },
  { word: 'stupid',   weight: 0.3, category: 'harassment' },
  { word: 'abuse',    weight: 0.8, category: 'harassment' }
];

export const classifyContentSafety = async (text) => {
  // Simulate asynchronous API latency for a scalable ML inference model mapping
  await new Promise(resolve => setTimeout(resolve, 50));

  if (!text) {
    return { safetyScore: 0, safetyLabel: 'SAFE', categories: [] };
  }

  const lowerText = text.toLowerCase();
  let accumulatedRisk = 0;
  const categories = new Set();

  for (const pattern of TOXIC_PATTERNS) {
    if (lowerText.includes(pattern.word)) {
      accumulatedRisk += pattern.weight;
      categories.add(pattern.category);
    }
  }

  const safetyScore = Math.min(accumulatedRisk, 1.0);
  let safetyLabel = 'SAFE';
  
  if (safetyScore >= 0.8) safetyLabel = 'RISKY';
  else if (safetyScore >= 0.3) safetyLabel = 'MODERATE';

  return {
    safetyScore,
    safetyLabel,
    categories: Array.from(categories),
    isFlagged: safetyScore >= 0.5 
  };
};
