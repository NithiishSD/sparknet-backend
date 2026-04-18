/**
 * Challenge Routes  [SparkNet Challenges — AI Judging + Peer Voting + Lifecycle]
 *
 * Routes:
 *   GET    /api/challenges/                → list all challenges
 *   POST   /api/challenges/               → create a new challenge
 *   POST   /api/challenges/join           → join a challenge
 *   POST   /api/challenges/:id/submit     → submit entry + AI scoring
 *   POST   /api/challenges/:id/vote       → peer vote for a candidate
 *   GET    /api/challenges/:id/leaderboard→ get challenge leaderboard
 *   GET    /api/challenges/:id            → get single challenge
 *   PATCH  /api/challenges/:id/close      → complete challenge (creator OR admin)
 *   PATCH  /api/challenges/:id/terminate  → force-terminate challenge (admin only)
 */

import express from 'express';
import { protect } from '../../middleware/Auth.js';
import Challenge from '../../models/Challenge.js';
import User from '../../models/User.js';
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

// ── Helper: check if user is creator or admin ───────────────────────────────
const isCreatorOrAdmin = (challenge, user) => {
  const isAdmin   = user.role === 'admin';
  const isCreator = challenge.createdBy && challenge.createdBy.toString() === user._id.toString();
  return isAdmin || isCreator;
};

// ─────────────────────────────────────────────────────────────────────────────
// LIST CHALLENGES
// GET /api/challenges/
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const user = req.user;
    const query = { $or: [{ visibility: 'global' }, { visibility: { $exists: false } }] };

    if (user.role === 'child' && user.guardianId) {
      query.$or.push({ createdBy: user.guardianId, visibility: 'family' });
    } else {
      query.$or.push({ createdBy: user._id, visibility: 'family' });
    }

    const challenges = await Challenge.find(query)
      .populate('participants.userId', 'username oauthAvatarUrl')
      .populate('winner', 'username oauthAvatarUrl')
      .lean();
    return res.json({ success: true, count: challenges.length, data: challenges });
  } catch (error) {
    console.error('[listChallenges]', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CREATE CHALLENGE
// POST /api/challenges/
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    if (req.user.role === 'child') {
      return res.status(403).json({ success: false, message: 'Children cannot create challenges' });
    }

    const { title, description, points, category, durationDays, visibility } = req.body;

    if (!title || !description) {
      return res.status(400).json({ success: false, message: 'Title and description are required' });
    }

    const days = durationDays || 7;
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    const newChallenge = await Challenge.create({
      title,
      description,
      points:      points || 100,
      category:    category || 'creative',
      durationDays: days,
      endDate,
      visibility:  visibility || 'global',
      createdBy:   req.user._id,
      status:      'active',
    });

    return res.status(201).json({ success: true, data: newChallenge });
  } catch (error) {
    console.error('[createChallenge]', error);
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
      .populate('winner', 'username oauthAvatarUrl')
      .populate('closedBy', 'username')
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

    // Cannot join a closed or terminated challenge
    if (challenge.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: `This challenge is already ${challenge.status} and cannot be joined.`,
      });
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

    if (challenge.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: `Submissions are closed. This challenge is ${challenge.status}.`,
      });
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
    participant.score       = aiScore + participant.voteScore;
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

    if (candidateUserId === voterId) {
      return res.status(400).json({ success: false, message: 'Cannot vote for yourself' });
    }

    const challenge = await Challenge.findById(req.params.id);
    if (!challenge) {
      return res.status(404).json({ success: false, message: 'Challenge not found' });
    }

    if (challenge.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: `Voting is closed. This challenge is ${challenge.status}.`,
      });
    }

    const voterIsParticipant = challenge.participants.some(
      (p) => p.userId.toString() === voterId
    );
    if (!voterIsParticipant) {
      return res.status(403).json({ success: false, message: 'You must join the challenge to vote' });
    }

    const candidate = challenge.participants.find(
      (p) => p.userId.toString() === candidateUserId
    );
    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate is not a participant' });
    }
    if (!candidate.entry) {
      return res.status(400).json({ success: false, message: 'Candidate has not submitted an entry yet' });
    }

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

    challenge.votes.push({ voter: req.user._id, candidate: candidateUserId });

    candidate.voteScore += POINTS_PER_VOTE;
    candidate.score      = candidate.aiScore + candidate.voteScore;

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
      .populate('winner', 'username oauthAvatarUrl')
      .lean();

    if (!challenge) {
      return res.status(404).json({ success: false, message: 'Challenge not found' });
    }

    return res.status(200).json({
      success: true,
      title:       challenge.title,
      status:      challenge.status,
      winner:      challenge.winner,
      leaderboard: challenge.leaderboard,
    });
  } catch (error) {
    console.error('[challengeLeaderboard]', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CLOSE / COMPLETE CHALLENGE
// PATCH /api/challenges/:id/close
// Allowed: challenge creator OR admin
// Effect:  marks status=completed, sets winner, awards points to top 3
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/:id/close', async (req, res) => {
  try {
    const challenge = await Challenge.findById(req.params.id);
    if (!challenge) {
      return res.status(404).json({ success: false, message: 'Challenge not found' });
    }

    if (!isCreatorOrAdmin(challenge, req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Only the challenge creator or an admin can close this challenge.',
      });
    }

    if (challenge.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: `Challenge is already ${challenge.status}.`,
      });
    }

    // Rebuild final leaderboard cleanly
    rebuildLeaderboard(challenge);

    // Determine winner (highest scorer who has submitted an entry)
    const submitters = challenge.participants
      .filter((p) => p.entry)
      .sort((a, b) => b.score - a.score);

    let winnerId = null;
    if (submitters.length > 0) {
      winnerId = submitters[0].userId;
    }

    // Award points to top 3 participants
    const rewards = [1.0, 0.5, 0.25]; // 100%, 50%, 25% of challenge.points
    const awardPromises = [];
    for (let i = 0; i < Math.min(submitters.length, 3); i++) {
      const pointsToAward = Math.round(challenge.points * rewards[i]);
      awardPromises.push(
        User.findByIdAndUpdate(submitters[i].userId, { $inc: { points: pointsToAward } })
      );
    }
    await Promise.all(awardPromises);

    // Mark challenge as completed
    challenge.status    = 'completed';
    challenge.winner    = winnerId;
    challenge.closedAt  = new Date();
    challenge.closedBy  = req.user._id;
    await challenge.save();

    return res.status(200).json({
      success: true,
      message: 'Challenge completed successfully. Points have been awarded.',
      winner:  winnerId,
      totalParticipants: challenge.participants.length,
      rewarded: submitters.slice(0, 3).map((p, i) => ({
        userId:       p.userId,
        pointsAwarded: Math.round(challenge.points * rewards[i]),
        finalScore:   p.score,
      })),
    });

  } catch (error) {
    console.error('[closeChallenge]', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TERMINATE CHALLENGE (force cancel)
// PATCH /api/challenges/:id/terminate
// Allowed: Admin ONLY
// Effect:  marks status=terminated, NO points awarded
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/:id/terminate', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can terminate a challenge.',
      });
    }

    const { reason } = req.body;

    const challenge = await Challenge.findById(req.params.id);
    if (!challenge) {
      return res.status(404).json({ success: false, message: 'Challenge not found' });
    }

    if (challenge.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: `Challenge is already ${challenge.status}.`,
      });
    }

    challenge.status             = 'terminated';
    challenge.closedAt           = new Date();
    challenge.closedBy           = req.user._id;
    challenge.terminationReason  = reason || 'Terminated by administrator.';
    await challenge.save();

    return res.status(200).json({
      success: true,
      message: 'Challenge has been terminated. No points have been awarded.',
      reason:  challenge.terminationReason,
    });

  } catch (error) {
    console.error('[terminateChallenge]', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
