/**
 * Behavior Analysis Background Worker [SparkNet AI Layer — Phase 8]
 *
 * Runs asynchronously on a schedule, decoupling heavy aggregation 
 * algorithms from the synchronous API response loop.
 */

import ActivityLog from '../../models/ActivityLog.js';
import { processActivityLogs } from '../services/behaviorEngine.js';

let isRunning = false;

// 15 minutes in ms
const POLL_INTERVAL = 15 * 60 * 1000; 

// In a real production system, lastProcessedId would be stored in the DB spanning multi-instance pods.
// For this single-instance architecture, memory acts as an acceptable queue cursor.
let lastProcessedId = null; 

const pollAndAnalyze = async () => {
  if (isRunning) return;
  isRunning = true;

  try {
    const query = lastProcessedId ? { _id: { $gt: lastProcessedId } } : {};
    
    // Process batches to prevent RAM explosion on the worker thread
    const logs = await ActivityLog.find(query)
      .sort({ _id: 1 })
      .limit(1000)
      .populate('referenceId') // Polymorphic populate to get post tags for Hybrid model
      .lean();

    if (logs.length > 0) {
      await processActivityLogs(logs);
      lastProcessedId = logs[logs.length - 1]._id;
      console.log(`[AI Worker] Processed ${logs.length} behavior logs.`);
    }

  } catch (error) {
    console.error('[AI Worker Error]', error);
  } finally {
    isRunning = false;
  }
};

/**
 * Boot up the asynchronous AI worker
 */
export const startBehaviorWorker = () => {
  console.log('🤖 Starting Background AI Behavior Worker...');
  setInterval(pollAndAnalyze, POLL_INTERVAL);
  
  // Also run immediately on boot
  pollAndAnalyze();
};
