require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');
const { createApp } = require('./src/app');
const pool = require('./src/config/database');
const mail = require('./src/config/mail');
const { corsOrigin, port } = require('./src/config/runtime');
const configureChatSocket = require('./src/realtime/chat-socket');
const logger = require('./src/config/logger');
const { repairBusinessData } = require('./src/services/data-consistency');

function startServer() {
    const { app, sessionMiddleware } = createApp();
    const server = http.createServer(app);
    const io = new Server(server, {
        cors: { origin: corsOrigin, credentials: true },
        transports: ['websocket', 'polling']
    });

    configureChatSocket(io, sessionMiddleware);
    app.set('io', io);

    server.on('error', error => {
        logger.error('server_error', { error: error.message });
        process.exitCode = 1;
    });

    server.listen(port, async () => {
        logger.info('server_started', { port });
        try {
            await repairBusinessData(pool);
        } catch (error) {
            logger.error('business_data_repair_failed', { error: error.message });
        }
        await mail.testConnection();
    });

    async function shutdown(signal) {
        logger.info('server_stopping', { signal });
        io.close();
        server.close(async () => {
            await pool.end();
            process.exit(0);
        });
    }

    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    return server;
}

// Hosting dùng Passenger có thể nạp startup file bằng require(). Vì vậy entry
// point phải tự khởi động thay vì phụ thuộc vào `require.main === module`.
let runningServer;
try {
    runningServer = startServer();
} catch (error) {
    logger.error('server_start_failed', { error: error.message });
    throw error;
}

module.exports = { startServer, runningServer };
