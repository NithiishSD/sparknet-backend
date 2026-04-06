import Conversation from '../../models/Conversation.js';
import Message from '../../models/Message.js';
import { processAndSaveMessage } from '../services/messagingService.js';
import { emitToUser } from '../../sockets/socketManager.js';
import appEvents, { EVENTS } from '../../events/eventEmitter.js';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/messaging/send
// Fallback HTTP route to send a message (alternative to WS emit)
// ─────────────────────────────────────────────────────────────────────────────
export const sendMessageAPI = async (req, res) => {
  try {
    const senderId = req.user._id;
    const { receiverId, content } = req.body;

    const result = await processAndSaveMessage(senderId, receiverId, content);

    // If message saved but flagged, the receiver must never get real-time ping!
    // If it's clean, push real time bounds!
    if (!result.isFlagged) {
      emitToUser(receiverId, 'RECEIVE_MESSAGE', result.message);

      // Trigger standard DB Notification asynchronous write
      appEvents.emit(EVENTS.MESSAGE_RECEIVED, {
        user: receiverId,
        sender: senderId,
        senderName: req.user.username,
        snippet: content.substring(0, 30),
        messageId: result.message._id
      });
    }

    return res.status(201).json({
      success: true,
      message: result.message // sender gets back full payload to display
    });
  } catch (error) {
    if (error.message.includes('SAFETY_BLOCK')) {
      return res.status(403).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/messaging/conversations
// Fetch all active thread inboxes for user, sorted by last message time
// ─────────────────────────────────────────────────────────────────────────────
export const getInboxConversations = async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Find all conversations containing this user
    let conversations = await Conversation.find({
      participants: userId,
      status: 'active'
    })
    .populate('lastMessage')
    .populate({
      path: 'participants',
      select: 'username oauthAvatarUrl role'
    })
    .sort({ updatedAt: -1 }) // Top of inbox
    .lean();

    // Attach unread counts
    const mapped = await Promise.all(conversations.map(async (conv) => {
      const unreadCount = await Message.countDocuments({
        conversationId: conv._id,
        receiverId: userId,
        isRead: false
      });
      // Extract the 'other' user to simplify UI payload
      const otherUser = conv.participants.find(p => p._id.toString() !== userId.toString());
      
      return { ...conv, unreadCount, otherUser };
    }));

    return res.status(200).json({ success: true, count: mapped.length, conversations: mapped });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/messaging/conversations/:id/messages
// Paginated message history lookup
// ─────────────────────────────────────────────────────────────────────────────
export const getConversationHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20); // allow slight larger chunking
    const skip  = (page - 1) * limit;

    const conversation = await Conversation.findOne({ _id: id, participants: userId });
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found or unauthorized' });
    }

    // Notice we filter out `isFlagged: true` UNLESS you are an admin.
    // We do not want users getting raw toxic loads!
    const query = { conversationId: id, isFlagged: false };

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Since sorting -1 gives newest first (good for UI pagination), we reverse it for chronological mapping
    messages.reverse();

    return res.status(200).json({ success: true, messages });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/messaging/conversations/:id/read
// Mark all messages in a specific thread as read
// ─────────────────────────────────────────────────────────────────────────────
export const markThreadAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    // Update all messages directed *to* this user in this thread 
    await Message.updateMany(
      { conversationId: id, receiverId: userId, isRead: false },
      { isRead: true }
    );

    return res.status(200).json({ success: true, message: 'Thread marked as read' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};
