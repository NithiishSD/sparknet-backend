import { EventEmitter } from 'events';

class AppEmitter extends EventEmitter {}

// Singleton instance to be shared across the entire SparkNet Node application
const appEvents = new AppEmitter();

// Increase Max Listeners if we plan to add many microservices listening
appEvents.setMaxListeners(20);

// Core System Events constant dictionary to prevent typo bugs
export const EVENTS = {
  USER_LIKED_POST:    'user_liked_post',
  USER_UNLIKED_POST:  'user_unliked_post',
  USER_COMMENTED:     'user_commented',
  COMMENT_DELETED:    'comment_deleted',
  MESSAGE_RECEIVED:   'message_received',
  GUARDIAN_ALERT:     'guardian_alert',   // fired when a child violates a guardian rule
};

export default appEvents;
