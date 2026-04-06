import http from 'http';
import 'dotenv/config';
import app from './app.js';
import connectDB from './config/db.js';
import { initSockets } from './sockets/socketManager.js';
import { startBehaviorWorker } from './ai/workers/behaviorWorker.js';

const PORT = process.env.PORT || 5000;

// Step 9: WebSockets — Wrap Express in a native HTTP server so Socket.io can bind to it
const server = http.createServer(app);
initSockets(server);

// Boot AI Background Layer
startBehaviorWorker();

const startServer = async () => {
  await connectDB();
  server.listen(PORT, () => {
    console.log(`\n Authentication & Real-Time Server running on port ${PORT}`);
    console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/api/health\n`);
  });
};

startServer();
