/**
 * Gamification Controller [SparkNet — Step 6]
 * 
 * Handles Challenges, Points, Badges, and assigning Trust Score based
 * on positive interactions. Youth-focused platforms use these mechanics
 * to encourage positive behavior.
 */

import Challenge from '../../models/Challenge.js';
import User from '../../models/User.js';

// ─────────────────────────────────────────────────────────────────────────────
// GET ALL ACTIVE CHALLENGES
// GET /api/v1/gamification/challenges
// ─────────────────────────────────────────────────────────────────────────────
export const getActiveChallenges = async (req, res) => {
  try {
    const challenges = await Challenge.find().sort({ createdAt: -1 }).lean();
    return res.status(200).json({ success: true, challenges });
  } catch (error) {
    console.error('[getActiveChallenges]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// JOIN A CHALLENGE
// POST /api/v1/gamification/challenges/:id/join
// ─────────────────────────────────────────────────────────────────────────────
export const joinChallenge = async (req, res) => {
  try {
    const challengeId = req.params.id;
    const userId      = req.user._id;

    const challenge = await Challenge.findById(challengeId);
    if (!challenge) {
      return res.status(404).json({ success: false, message: 'Challenge not found' });
    }

    if (challenge.participants.includes(userId)) {
      return res.status(400).json({ success: false, message: 'Already participating in this challenge' });
    }

    challenge.participants.push(userId);
    // Initialize leaderboard score at 0
    challenge.leaderboard.push({ user: userId, score: 0 });
    await challenge.save();

    return res.status(200).json({ success: true, message: 'Joined challenge successfully!', challenge });
  } catch (error) {
    console.error('[joinChallenge]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPLETE CHALLENGE / ASSIGN REWARDS
// POST /api/v1/gamification/challenges/:id/complete
//
// In a real app, this might be triggered asynchronously by backend events
// (e.g. user posted 5 times without moderation flags).
// But for this platform, we provide a generic finish endpoint for demo/admin tracking.
// ─────────────────────────────────────────────────────────────────────────────
export const completeChallenge = async (req, res) => {
  try {
    const challengeId = req.params.id;
    const userId      = req.user._id;

    const challenge = await Challenge.findById(challengeId);
    if (!challenge) {
      return res.status(404).json({ success: false, message: 'Challenge not found' });
    }

    const isParticipating = challenge.participants.includes(userId);
    if (!isParticipating) {
      return res.status(400).json({ success: false, message: 'You must join the challenge before completing it.' });
    }

    // Assign points and increase Trust Score (+5 for completing a challenge)
    const pointsAwarded = challenge.points || 100;
    
    // Add logic to avoid claiming multiple times in a robust system
    // Here we'll just award the user.

    const user = await User.findById(userId);
    user.points += pointsAwarded;
    // Cap trust score at 100 max
    user.trustScore = Math.min(100, user.trustScore + 5); 
    
    // Example: Assign a badge if they hit milestone sizes
    if (user.points >= 1000 && !user.badges.includes('Rising Star')) {
      user.badges.push('Rising Star');
    }

    await user.save();

    return res.status(200).json({ 
      success: true, 
      message: `Challenge completed! You earned ${pointsAwarded} points and +5 Trust Score.`,
      points: user.points,
      trustScore: user.trustScore,
      badges: user.badges
    });
  } catch (error) {
    console.error('[completeChallenge]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET USER PROGRESS / STATS
// GET /api/v1/gamification/progress
// ─────────────────────────────────────────────────────────────────────────────
export const getGamificationStats = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('points badges trustScore');
    
    // Calculate level based on points (e.g., Level 1 every 500 points)
    const currentLevel = Math.floor(user.points / 500) + 1;
    const nextMilestone = currentLevel * 500;

    return res.status(200).json({
      success: true,
      stats: {
        points: user.points,
        badges: user.badges,
        trustScore: user.trustScore,
        currentLevel,
        nextMilestone,
        progressToNextLevel: Math.round(((user.points % 500) / 500) * 100)
      }
    });

  } catch (error) {
    console.error('[getGamificationStats]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};
