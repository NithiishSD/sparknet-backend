import Report from '../../models/Report.js';
import Post from '../../models/Post.js';
import Comment from '../../models/Comment.js';

export const reportContent = async (req, res) => {
  try {
    const { target_id, type, reason } = req.body;
    const userId = req.user.id;

    if (!['post', 'comment'].includes(type)) {
      return res.status(400).json({ message: "Invalid report type" });
    }

    // Verify the target exists
    if (type === 'post') {
      const post = await Post.findById(target_id);
      if (!post) return res.status(404).json({ message: "Post not found" });
    } else if (type === 'comment') {
      const comment = await Comment.findById(target_id);
      if (!comment) return res.status(404).json({ message: "Comment not found" });
    }

    const existingReport = await Report.findOne({ reporter_id: userId, target_id, type });
    if (existingReport) {
      return res.status(400).json({ message: "You have already reported this content" });
    }

    const newReport = new Report({
      reporter_id: userId,
      target_id,
      type,
      reason
    });

    await newReport.save();

    res.status(201).json({ success: true, message: "Content reported successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};
