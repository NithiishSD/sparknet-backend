import express from 'express';
import { protect } from '../../middleware/Auth.js';
import enforceChildControls from '../../middleware/enforceChildControls.js';
import {
  sendMessageAPI,
  getInboxConversations,
  getConversationHistory,
  markThreadAsRead
} from '../controllers/messagingController.js';

const router = express.Router();

// All messaging endpoints require strict authentication
router.use(protect);

// enforceChildControls('messaging') checks:
//   1. guardian's messaging master switch
//   2. allowlist — receiverId must be in allowedMessagingContacts if list is non-empty
router.post('/send', enforceChildControls('messaging'), sendMessageAPI);
router.get('/conversations', getInboxConversations);
router.get('/conversations/:id/messages', getConversationHistory);
router.patch('/conversations/:id/read', markThreadAsRead);

export default router;

