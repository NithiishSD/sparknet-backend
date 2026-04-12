// Paths fixed to go up from auth/controllers to reach src/models
import Profile from '../../models/Profile.js';
import PrivacySettings from '../../models/PrivacySettings.js';
import ActivitySummary from '../../models/ActivitySummary.js';
import User from '../../models/User.js';

// Get Own Profile (Auto-creates if missing)
export const getMyProfile = async (req, res) => {
  try {
    let profile = await Profile.findOne({ user: req.user._id }).populate('user', 'username email role');
    
    if (!profile) {
      profile = await Profile.create({ user: req.user._id, displayName: req.user.username });
      await PrivacySettings.create({ user: req.user._id });
      await ActivitySummary.create({ user: req.user._id });
      profile = await Profile.findOne({ user: req.user._id }).populate('user', 'username email role');
    }

    const activity = await ActivitySummary.findOne({ user: req.user._id });
    const privacy = await PrivacySettings.findOne({ user: req.user._id });

    res.status(200).json({ success: true, data: { profile, activity, privacy } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update Profile
export const updateProfile = async (req, res) => {
  try {
    const updates = req.body;
    if (req.file) {
      updates.avatar = `/uploads/avatars/${req.file.filename}`;
    }

    const profile = await Profile.findOneAndUpdate(
      { user: req.user._id },
      { $set: updates },
      { new: true, runValidators: true, upsert: true }
    );

    res.status(200).json({ success: true, message: "Profile updated", data: profile });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Get Public Profile
export const getPublicProfile = async (req, res) => {
  try {
    const { username } = req.params;
    const targetUser = await User.findOne({ username });
    if (!targetUser) return res.status(404).json({ success: false, message: "User not found" });

    const privacy = await PrivacySettings.findOne({ user: targetUser._id });
    if (privacy?.profileVisibility === 'private' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: "This profile is private" });
    }

    const profile = await Profile.findOne({ user: targetUser._id });
    const activity = await ActivitySummary.findOne({ user: targetUser._id });

    res.status(200).json({ success: true, data: { profile, activity } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update Privacy
export const updatePrivacy = async (req, res) => {
  try {
    const settings = await PrivacySettings.findOneAndUpdate(
      { user: req.user._id },
      { $set: req.body },
      { new: true, upsert: true }
    );
    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Get Activity
export const getActivity = async (req, res) => {
  try {
    const activity = await ActivitySummary.findOne({ user: req.user._id });
    res.status(200).json({ success: true, data: activity });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Reset Profile
export const resetProfile = async (req, res) => {
  try {
    await Profile.findOneAndUpdate({ user: req.user._id }, { bio: "", interests: [] });
    res.status(200).json({ success: true, message: "Profile cleared" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Search Users
export const searchUsers = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(200).json({ success: true, data: [] });
    }

    const regex = new RegExp(query, 'i');
    const users = await User.find({ username: regex })
      .select('username oauthAvatarUrl role status')
      .limit(20)
      .lean();

    // Fetch corresponding profiles to get displayName and bio
    const userIds = users.map(u => u._id);
    const profiles = await Profile.find({ user: { $in: userIds } })
      .select('user displayName bio avatar')
      .lean();

    const data = users.map(user => {
      const profileInfo = profiles.find(p => String(p.user) === String(user._id));
      return {
        _id: user._id,
        username: user.username,
        role: user.role,
        status: user.status,
        oauthAvatarUrl: user.oauthAvatarUrl,
        displayName: profileInfo?.displayName,
        bio: profileInfo?.bio,
        avatar: profileInfo?.avatar
      };
    });

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
