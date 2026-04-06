/**
 * Messaging Service [SparkNet]
 * 
 * Central business logic for message constraints, validation, and AI moderation.
 * Keeping this completely separate from Controller handling so WebSockets can safely invoke it.
 */

import Conversation from '../../models/Conversation.js';
import Message from '../../models/Message.js';
import User from '../../models/User.js';
import { canInteractWithUser } from '../../users/services/connectionService.js';
import { analyzeContent } from '../../moderation/services/moderationService.js';

/**
 * Handle all rigorous pre-flight checks before saving a message to DB.
 * 
 * @param {String} senderId 
 * @param {String} receiverId 
 * @param {String} content 
 * @returns {Object} { success: Boolean, message: String, data: MessageDoc }
 */
export const processAndSaveMessage = async (senderId, receiverId, content) => {
  try {
    // 1(a). Validate payload
    if (!content || !content.trim()) {
      throw new Error('Message content cannot be empty');
    }

    // 1(b). Validate users exist
    const [sender, receiver] = await Promise.all([
      User.findById(senderId),
      User.findById(receiverId)
    ]);

    if (!sender || !receiver) {
      throw new Error('Invalid sender or receiver');
    }

    // 2. Youth Safety Strict Enforcements (Step 4 Requirement)
    // The connectionService organically forces Youth accounts to only pass if mutual connections exist.
    const isAllowed = await canInteractWithUser(senderId.toString(), sender.role, receiverId);
    if (!isAllowed) {
      throw new Error('SAFETY_BLOCK: You are not permitted to message this user.');
    }

    // 3. AI Moderation Check (Step 5 Requirement)
    // Run content analysis to detect toxic/profane language
    const moderationResult = analyzeContent(content);
    let isFlagged = false;
    let moderationRemark = null;

    if (moderationResult.riskLevel === 'high' || moderationResult.riskLevel === 'medium') {
      isFlagged = true;
      moderationRemark = `Blocked keyword category: ${moderationResult.category}`;
      
      // OPTIONAL: If it's a completely toxic message, we can hard-reject it instead of saving it flagged.
      // For SparkNet, we'll save it as tightly flagged so the receiver doesn't see it but admins do.
    }

    // 4. Resolve Conversation Object
    // Find an existing one between these exactly two participants
    let conversation = await Conversation.findOne({
      participants: { $all: [senderId, receiverId], $size: 2 }
    });

    if (!conversation) {
      // Create new DM thread
      conversation = await Conversation.create({
        participants: [senderId, receiverId]
      });
    }

    // 5. Store Message
    const newMessage = await Message.create({
      conversationId: conversation._id,
      senderId,
      receiverId,
      content,
      messageType: 'text',
      isRead: false,
      isFlagged,
      moderationRemark
    });

    // 6. Bump conversation to top of inbox
    conversation.lastMessage = newMessage._id;
    // Mongoose implicitly updates `updatedAt` because we're calling save()
    await conversation.save();

    return { 
      success: true, 
      isFlagged, 
      message: newMessage, 
      conversationId: conversation._id 
    };

  } catch (error) {
    if (error.message.includes('SAFETY_BLOCK')) {
       // Re-throw explicitly so Controller/Socket knows why it failed
       throw error;
    }
    console.error('[messagingService -> processAndSaveMessage]', error);
    throw new Error('Internal messaging error');
  }
};
