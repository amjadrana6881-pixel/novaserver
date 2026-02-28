require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { PrismaClient } = require('@prisma/client');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const walletRoutes = require('./routes/wallet');
const depositRoutes = require('./routes/deposit');
const withdrawRoutes = require('./routes/withdraw');
const { router: robotRoutes } = require('./routes/robot');
const loanRoutes = require('./routes/loan');
const tradeRoutes = require('./routes/trade');
const adminRoutes = require('./routes/admin');
const marketRoutes = require('./routes/market');
const chatRoutes = require('./routes/chat');
const notificationRoutes = require('./routes/notification');
const bannerRoutes = require('./routes/banner');
const configRoutes = require('./routes/config');
const cronRoutes = require('./routes/cron');
const path = require('path');

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const { Server } = require('socket.io');
const io = new Server(server, {
    cors: { origin: process.env.FRONTEND_URL || '*', credentials: true }
});
const socketUtils = require('./utils/socket');
socketUtils.init(io);

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve uploaded files (banners, etc.)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Request logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', name: 'NovaTrade API', version: '1.0.0', time: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/deposit', depositRoutes);
app.use('/api/withdraw', withdrawRoutes);
app.use('/api/robot', robotRoutes);
app.use('/api/loan', loanRoutes);
app.use('/api/trade', tradeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notification', notificationRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/config', configRoutes);
app.use('/api/cron', cronRoutes);

// Error handler
app.use((err, req, res, next) => {
    console.error('[ERROR]', err.message);
    res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error' });
});

// 404
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});

const PORT = process.env.PORT || 3001;

// Seed default data
async function seedData() {
    try {
        // Seed robots if none exist
        const robotCount = await prisma.robot.count();
        if (robotCount === 0) {
            await prisma.robot.createMany({
                data: [
                    { name: 'Robot Basic', price: 50, dailyReturn: 1.5, fixedProfit: 5, period: 3, minLevel: 'V' },
                    { name: 'Robot No.1', price: 100, dailyReturn: 2.0, fixedProfit: 12, period: 3, minLevel: 'V' },
                    { name: 'Robot No.2', price: 200, dailyReturn: 2.2, fixedProfit: 28, period: 3, minLevel: 'V' },
                    { name: 'Robot No.3', price: 500, dailyReturn: 2.5, fixedProfit: 75, period: 3, minLevel: 'V' },
                    { name: 'Robot No.4', price: 1000, dailyReturn: 3.0, fixedProfit: 160, period: 3, minLevel: 'V' },
                ]
            });
            console.log('✅ Seeded robots');
        }

        // Create admin if not exists
        const adminExists = await prisma.user.findFirst({ where: { isAdmin: true } });
        if (!adminExists) {
            const bcrypt = require('bcryptjs');
            await prisma.user.create({
                data: {
                    email: 'admin@novatrade.com',
                    password: await bcrypt.hash('Admin@123', 10),
                    nickname: 'Admin',
                    vipLevel: 'V8',
                    inviteCode: 'ADMIN001',
                    isAdmin: true,
                    kycStatus: 'approved'
                }
            });
            console.log('✅ Seeded admin user (admin@novatrade.com / Admin@123)');
        }
    } catch (err) {
        console.log('Seed skipped:', err.message);
    }
}

// Only runs when running locally (not on Vercel)
if (process.env.NODE_ENV !== 'production') {
    // Scheduler for Robot Settlement (Every 1 minute) local only
    const { processExpiredOrders } = require('./routes/robot');
    setInterval(() => {
        processExpiredOrders();
    }, 60 * 1000);

    server.listen(PORT, async () => {
        console.log(`\n🚀 NovaTrade API running on http://localhost:${PORT}`);
        console.log(`📋 Health: http://localhost:${PORT}/api/health\n`);
        await seedData();
    });
} else {
    // On Vercel:
    // 1. DO NOT run setInterval (use Vercel Cron if needed)
    // 2. DO NOT auto-seed on every request (too slow/risky)
    // Export app for Vercel
    console.log('🚀 NovaTrade API loaded in Vercel environment');
}

module.exports = app;
