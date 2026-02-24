let io;

const init = (socketIoInstance) => {
    io = socketIoInstance;

    io.on('connection', (socket) => {
        const userId = socket.handshake.query.userId;
        if (userId) {
            socket.join(`user_${userId}`);
            console.log(`User connected: ${userId} (Socket: ${socket.id})`);
        }

        socket.on('disconnect', () => {
            console.log(`Socket disconnected: ${socket.id}`);
        });
    });
};

const sendNotification = (userId, data) => {
    if (io) {
        io.to(`user_${userId}`).emit('notification', data);
    }
};

const broadcastNotification = (data) => {
    if (io) {
        io.emit('notification', data);
    }
};

module.exports = { init, sendNotification, broadcastNotification };
