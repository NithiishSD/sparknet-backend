/**
 * Family Group Controller  [SparkNet Family System]
 *
 * Route handlers for family group CRUD + leaderboard + challenge linking.
 * Reuses existing User.points / User.badges and Challenge model entirely.
 *
 * Routes handled:
 *   POST   /api/family/group               → createFamilyGroup
 *   GET    /api/family/group/:id/leaderboard → getFamilyLeaderboard
 *   POST   /api/family/group/:id/challenge   → linkChallengeToFamily
 */

import FamilyGroup from '../../models/FamilyGroup.js';
import User from '../../models/User.js';
import Challenge from '../../models/Challenge.js';

// ─────────────────────────────────────────────────────────────────────────────
// CREATE FAMILY GROUP
// POST /api/family/group
// ─────────────────────────────────────────────────────────────────────────────
export const createFamilyGroup = async (req, res) => {
  try {
    const { name } = req.body;
    const creator = req.user;

    if (!name?.trim()) {
      return res.status(400).json({ success: false, message: 'Family group name is required' });
    }

    // Start members list with creator as admin
    const members = [{ userId: creator._id, role: 'admin' }];

    // Auto-add all linked children as members
    if (Array.isArray(creator.childLinks) && creator.childLinks.length > 0) {
      for (const link of creator.childLinks) {
        const childId = link.childId?.toString?.() ?? link.childId;
        // Avoid duplicate if creator somehow appears in own childLinks
        if (childId && childId !== creator._id.toString()) {
          members.push({ userId: childId, role: 'member' });
        }
      }
    }

    const group = await FamilyGroup.create({
      name: name.trim(),
      createdBy: creator._id,
      members,
    });

    await group.populate('members.userId', 'username oauthAvatarUrl role');

    return res.status(201).json({
      success: true,
      message: 'Family group created',
      group,
    });

  } catch (error) {
    console.error('[createFamilyGroup]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET FAMILY LEADERBOARD
// GET /api/family/group/:id/leaderboard
// ─────────────────────────────────────────────────────────────────────────────
export const getFamilyLeaderboard = async (req, res) => {
  try {
    const group = await FamilyGroup.findById(req.params.id);

    if (!group) {
      return res.status(404).json({ success: false, message: 'Family group not found' });
    }

    // Verify requester is a member
    const isMember = group.members.some(
      (m) => m.userId.toString() === req.user._id.toString()
    );
    if (!isMember && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not a member of this family group' });
    }

    // Aggregate points & badges for all members directly from User docs
    const memberIds = group.members.map((m) => m.userId);
    const users = await User.find(
      { _id: { $in: memberIds } },
      'username points badges oauthAvatarUrl'
    ).lean();

    // Sort descending by points
    const leaderboard = users
      .map((u) => ({
        userId:   u._id,
        username: u.username,
        points:   u.points ?? 0,
        badges:   u.badges ?? [],
        avatar:   u.oauthAvatarUrl ?? null,
      }))
      .sort((a, b) => b.points - a.points);

    return res.status(200).json({
      success: true,
      groupName: group.name,
      leaderboard,
    });

  } catch (error) {
    console.error('[getFamilyLeaderboard]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// LINK CHALLENGE TO FAMILY GROUP
// POST /api/family/group/:id/challenge
// ─────────────────────────────────────────────────────────────────────────────
export const linkChallengeToFamily = async (req, res) => {
  try {
    const { challengeId } = req.body;

    if (!challengeId) {
      return res.status(400).json({ success: false, message: 'challengeId is required' });
    }

    const group = await FamilyGroup.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Family group not found' });
    }

    // Only group admins can link challenges
    const memberEntry = group.members.find(
      (m) => m.userId.toString() === req.user._id.toString()
    );
    if (!memberEntry || memberEntry.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only group admins can link challenges' });
    }

    // Verify challenge exists
    const challenge = await Challenge.findById(challengeId);
    if (!challenge) {
      return res.status(404).json({ success: false, message: 'Challenge not found' });
    }

    // Avoid duplicate linking
    if (group.challenges.some((c) => c.toString() === challengeId)) {
      return res.status(409).json({ success: false, message: 'Challenge already linked to this group' });
    }

    group.challenges.push(challengeId);
    await group.save();

    return res.status(200).json({
      success: true,
      message: 'Challenge linked to family group',
      challenges: group.challenges,
    });

  } catch (error) {
    console.error('[linkChallengeToFamily]', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};
