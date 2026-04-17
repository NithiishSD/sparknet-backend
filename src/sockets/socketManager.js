/**
 * WebSocket Manager [SparkNet — Step 9]
 * 
 * Handles real-time events mapping.
 * Uses JWT decoding to upgrade authenticated HTTP requests to connected Sockets.
 * Maintains an in-memory mapped register of { userId: socketId } to emit direct events.
 */

import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { processAndSaveMessage } from '../messaging/services/messagingService.js';
import Message from '../models/Message.js';
import appEvents, { EVENTS } from '../events/eventEmitter.js';

let io;

// In-memory mapping of active users
// Key: userId string -> Value: socket object representing the active connection
export const connectedUsers = new Map();

/**
 * Initialize Socket.io and attach it to the Express HTTP Server
 */
export const initSockets = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'https://sparknetapp.vercel.app',
      credentials: true
    }
  });

  // Socket Authentication Middleware
  io.use((socket, next) => {
    try {
      // Typically the client passes token in an auth payload:
      // socket = io("ws://host", { auth: { token: "JWT..." } })
      const token = socket.handshake.auth.token;

      if (!token) return next(new Error('Authentication Error: Missing Token'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded; // attach payload onto socket map
      next();
    } catch (err) {
      return next(new Error('Authentication Error: Invalid Token'));
    }
  });

  // On successful authentication & connection
  io.on('connection', (socket) => {
    const userId = socket.user.userId;
    console.log(`🔌 Client connected [User: ${userId}]`);

    // Map user to this socket instance for targeted broadcasts
    connectedUsers.set(userId, socket);

    // ─── MESSAGING EVENTS ENFORCEMENT ────────────────────────

    socket.on('SEND_MESSAGE', async (payload, callback) => {
      // payload: { receiverId, content }
      try {
        const result = await processAndSaveMessage(userId, payload.receiverId, payload.content);

        // Push strictly if it safely passed the moderation flagging boundaries
        if (!result.isFlagged) {
          const receiverSocket = connectedUsers.get(payload.receiverId.toString());
          if (receiverSocket) {
            receiverSocket.emit('RECEIVE_MESSAGE', result.message);
          }

          // Trigger standard DB Notification asynchronous write
          appEvents.emit(EVENTS.MESSAGE_RECEIVED, {
            user: payload.receiverId,
            sender: userId,
            senderName: socket.user.username,
            snippet: payload.content.substring(0, 30),
            messageId: result.message._id
          });
        }

        // Acknowledge back to sender that it was processed (and optionally flagged)
        if (callback) callback({ success: true, message: result.message, isFlagged: result.isFlagged });

      } catch (error) {
        // Specifically bounce Youth Safety Blocks back to UI live
        if (callback) callback({ success: false, error: error.message });
      }
    });

    socket.on('MARK_READ', async (payload) => {
      // payload: { conversationId, messageIds: [] }
      try {
        await Message.updateMany(
          {
            conversationId: payload.conversationId,
            receiverId: userId,
            _id: { $in: payload.messageIds }
          },
          { isRead: true }
        );

        // Let the sender know their messages were read (Read Receipts)
        // Extract the sender from one of the messages to bounce the event back
        const peek = await Message.findById(payload.messageIds[0]);
        if (peek) {
          const senderSocket = connectedUsers.get(peek.senderId.toString());
          if (senderSocket) {
            senderSocket.emit('MESSAGE_READ', { conversationId: payload.conversationId, messageIds: payload.messageIds });
          }
        }
      } catch (err) {
        console.error('[Socket MARK_READ error]', err);
      }
    });

    // ────────────────────────────────────────────────────────

    socket.on('disconnect', () => {
      console.log(`🔌 Client disconnected [User: ${userId}]`);
      connectedUsers.delete(userId);
    });
  });

  return io;
};

/**
 * Emit an event natively to one specific user (if they are online).
 *
 * @param {String} targetUserId
 * @param {String} eventName
 * @param {Object} payload 
 */
export const emitToUser = (targetUserId, eventName, payload) => {
  if (!io) return;
  const targetSocket = connectedUsers.get(targetUserId.toString());
  if (targetSocket) {
    targetSocket.emit(eventName, payload);
  }
};
