/**
 * Challenge Routes  [SparkNet Challenges — AI Judging + Peer Voting]
 *
 * Routes:
 *   GET    /api/challenges/                → list all challenges
 *   POST   /api/challenges/join            → join a challenge
 *   POST   /api/challenges/:id/submit      → submit entry + AI scoring
 *   POST   /api/challenges/:id/vote        → peer vote for a candidate
 *   GET    /api/challenges/:id/leaderboard → get challenge leaderboard
 */

import express from 'express';
import { protect } from '../../middleware/Auth.js';
import Challenge from '../../models/Challenge.js';
import { classifyContentSafety } from '../../ai/services/safetyEngine.js';

const router = express.Router();
router.use(protect);

// ── Helper: recompute leaderboard from participants ─────────────────────────
const rebuildLeaderboard = (challenge) => {
  challenge.leaderboard = challenge.participants
    .map((p) => ({
      user:      p.userId,
      aiScore:   p.aiScore,
      voteScore: p.voteScore,
      score:     p.aiScore + p.voteScore,
    }))
    .sort((a, b) => b.score - a.score);
};

// ─────────────────────────────────────────────────────────────────────────────
// LIST CHALLENGES
// GET /api/challenges/
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const challenges = await Challenge.find()
      .populate('participants.userId', 'username oauthAvatarUrl')
      .lean();
    return res.json({ success: true, count: challenges.length, data: challenges });
  } catch (error) {
    console.error('[listChallenges]', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET SINGLE CHALLENGE
// GET /api/challenges/:id
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const challenge = await Challenge.findById(req.params.id)
      .populate('participants.userId', 'username oauthAvatarUrl')
      .lean();
    
    if (!challenge) {
      return res.status(404).json({ success: false, message: 'Challenge not found' });
    }
    
    return res.json({ success: true, data: challenge });
  } catch (error) {
    console.error('[getChallenge]', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// JOIN CHALLENGE
// POST /api/challenges/join   body: { challengeId }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/join', async (req, res) => {
  try {
    const { challengeId } = req.body;
    if (!challengeId) {
      return res.status(400).json({ success: false, message: 'challengeId is required' });
    }

    const challenge = await Challenge.findById(challengeId);
    if (!challenge) {
      return res.status(404).json({ success: false, message: 'Challenge not found' });
    }

    const alreadyJoined = challenge.participants.some(
      (p) => p.userId.toString() === req.user._id.toString()
    );
    if (alreadyJoined) {
      return res.status(409).json({ success: false, message: 'Already joined this challenge' });
    }

    challenge.participants.push({ userId: req.user._id });
    await challenge.save();

    return res.status(200).json({ success: true, message: 'Joined challenge' });
  } catch (error) {
    console.error('[joinChallenge]', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SUBMIT ENTRY + AI SCORING
// POST /api/challenges/:id/submit   body: { entry }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/submit', async (req, res) => {
  try {
    const { entry } = req.body;
    if (!entry?.trim()) {
      return res.status(400).json({ success: false, message: 'Entry text is required' });
    }

    const challenge = await Challenge.findById(req.params.id);
    if (!challenge) {
      return res.status(404).json({ success: false, message: 'Challenge not found' });
    }

    const participant = challenge.participants.find(
      (p) => p.userId.toString() === req.user._id.toString()
    );
    if (!participant) {
      return res.status(403).json({ success: false, message: 'You must join the challenge first' });
    }

    // ── AI Scoring Pipeline ───────────────────────────────────────────────
    const safety = await classifyContentSafety(entry);

    const lengthScore      = Math.min(entry.length / 500, 1) * 40;           // 40 pts max
    const safetyBonus      = (1 - (safety.safetyScore ?? 0)) * 30;           // 30 pts for clean content
    const randomCreativity = Math.random() * 30;                              // 30 pts placeholder
    const aiScore          = Math.round(lengthScore + safetyBonus + randomCreativity);

    // Save entry + AI score
    participant.entry       = entry.trim();
    participant.aiScore     = aiScore;
    participant.score       = aiScore + participant.voteScore;  // combine with any existing votes
    participant.submittedAt = new Date();

    // Rebuild leaderboard after scoring
    rebuildLeaderboard(challenge);
    await challenge.save();

    return res.status(200).json({
      success: true,
      message: 'Entry submitted and scored',
      scoring: {
        lengthScore:      Math.round(lengthScore),
        safetyBonus:      Math.round(safetyBonus),
        randomCreativity: Math.round(randomCreativity),
        aiScore,
        totalScore:       participant.score,
      },
    });

  } catch (error) {
    console.error('[submitEntry]', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PEER VOTE
// POST /api/challenges/:id/vote   body: { candidateUserId }
// ─────────────────────────────────────────────────────────────────────────────
const MAX_VOTES_PER_USER = 3;
const POINTS_PER_VOTE    = 5;

router.post('/:id/vote', async (req, res) => {
  try {
    const { candidateUserId } = req.body;
    const voterId = req.user._id.toString();

    if (!candidateUserId) {
      return res.status(400).json({ success: false, message: 'candidateUserId is required' });
    }

    // Cannot vote for yourself
    if (candidateUserId === voterId) {
      return res.status(400).json({ success: false, message: 'Cannot vote for yourself' });
    }

    const challenge = await Challenge.findById(req.params.id);
    if (!challenge) {
      return res.status(404).json({ success: false, message: 'Challenge not found' });
    }

    // Voter must be a participant
    const voterIsParticipant = challenge.participants.some(
      (p) => p.userId.toString() === voterId
    );
    if (!voterIsParticipant) {
      return res.status(403).json({ success: false, message: 'You must join the challenge to vote' });
    }

    // Candidate must be a participant with a submitted entry
    const candidate = challenge.participants.find(
      (p) => p.userId.toString() === candidateUserId
    );
    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate is not a participant' });
    }
    if (!candidate.entry) {
      return res.status(400).json({ success: false, message: 'Candidate has not submitted an entry yet' });
    }

    // Anti-manipulation: max 3 votes per voter per challenge
    const voterVoteCount = challenge.votes.filter(
      (v) => v.voter.toString() === voterId
    ).length;
    if (voterVoteCount >= MAX_VOTES_PER_USER) {
      return res.status(429).json({
        success: false,
        message: `Maximum ${MAX_VOTES_PER_USER} votes reached for this challenge`,
        votesRemaining: 0,
      });
    }

    // Record vote
    challenge.votes.push({
      voter:     req.user._id,
      candidate: candidateUserId,
    });

    // Add vote points to candidate
    candidate.voteScore += POINTS_PER_VOTE;
    candidate.score      = candidate.aiScore + candidate.voteScore;

    // Rebuild leaderboard
    rebuildLeaderboard(challenge);
    await challenge.save();

    return res.status(200).json({
      success: true,
      message: 'Vote recorded',
      votesRemaining: MAX_VOTES_PER_USER - (voterVoteCount + 1),
      candidateNewScore: candidate.score,
    });

  } catch (error) {
    console.error('[voteChallenge]', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET LEADERBOARD
// GET /api/challenges/:id/leaderboard
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/leaderboard', async (req, res) => {
  try {
    const challenge = await Challenge.findById(req.params.id)
      .populate('leaderboard.user', 'username oauthAvatarUrl points badges')
      .lean();

    if (!challenge) {
      return res.status(404).json({ success: false, message: 'Challenge not found' });
    }

    return res.status(200).json({
      success: true,
      title: challenge.title,
      leaderboard: challenge.leaderboard,
    });
  } catch (error) {
    console.error('[challengeLeaderboard]', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;

