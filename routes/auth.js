const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { generateCode, sendVerificationEmail } = require('../utils/email');
const { auth } = require('../middleware/auth');
const prisma = new PrismaClient();

// Generate invite code
const genInviteCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
};

// Initialize wallets for new user
const initWallets = async (userId) => {
    const coins = ['USDT', 'BTC', 'ETH', 'BNB', 'XRP', 'SOL', 'DOGE', 'ADA', 'DOT', 'AVAX', 'MATIC', 'LINK', 'UNI', 'LTC', 'ATOM', 'TRX', 'SHIB', 'FIL'];
    const wallets = [];
    for (const coin of coins) {
        for (const account of ['spot', 'contract', 'financial']) {
            wallets.push({ userId, coin, account, available: 0, frozen: 0 });
        }
    }
    await prisma.wallet.createMany({ data: wallets });
};

// Send verification code
router.post('/send-code', async (req, res) => {
    try {
        const { email, type = 'register' } = req.body;
        if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

        // Check if user exists for register
        if (type === 'register') {
            const existing = await prisma.user.findUnique({ where: { email } });
            if (existing) return res.status(400).json({ success: false, message: 'Email already registered' });
        }

        const code = generateCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

        await prisma.verifyCode.create({ data: { email, code, type, expiresAt } });

        // Try sending email, but don't fail if SMTP not configured
        const sent = await sendVerificationEmail(email, code, type);

        // In dev mode, log the code
        if (process.env.NODE_ENV === 'development') {
            console.log(`📧 Verification code for ${email}: ${code}`);
        }

        res.json({ success: true, message: sent ? 'Verification code sent' : 'Code generated (check server logs in dev mode)', code: process.env.NODE_ENV === 'development' ? code : undefined });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Register
router.post('/register', async (req, res) => {
    try {
        const { email, password, code, inviteCode } = req.body;
        if (!email || !password || !code) return res.status(400).json({ success: false, message: 'Email, password, and verification code are required' });

        // Verify code
        const verifyCode = await prisma.verifyCode.findFirst({
            where: { email, code, type: 'register', used: false, expiresAt: { gte: new Date() } },
            orderBy: { createdAt: 'desc' }
        });
        if (!verifyCode) return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });

        // Check if email taken
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) return res.status(400).json({ success: false, message: 'Email already registered' });

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                inviteCode: genInviteCode(),
                invitedBy: inviteCode || null,
            }
        });

        // Mark code as used
        await prisma.verifyCode.update({ where: { id: verifyCode.id }, data: { used: true } });

        // Create wallets
        await initWallets(user.id);

        // Send welcome notification
        await prisma.notification.create({
            data: { userId: user.id, type: 'system', title: 'Welcome to NovaTrade!', content: 'Your account has been created. Complete KYC to unlock all features.' }
        });

        // Generate token
        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

        res.json({ success: true, message: 'Registration successful', data: { token, user: { id: user.id, email: user.email, nickname: user.nickname, vipLevel: user.vipLevel, inviteCode: user.inviteCode, kycStatus: user.kycStatus } } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        let { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required' });

        email = email.trim().toLowerCase();
        password = password.trim();

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });
        if (!user.isActive) return res.status(403).json({ success: false, message: 'Account deactivated' });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials' });

        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

        res.json({ success: true, data: { token, user: { id: user.id, email: user.email, nickname: user.nickname, vipLevel: user.vipLevel, inviteCode: user.inviteCode, isAdmin: user.isAdmin, kycStatus: user.kycStatus, avatar: user.avatar } } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Reset password
router.post('/reset-password', async (req, res) => {
    try {
        const { email, password, code } = req.body;
        if (!email || !password || !code) return res.status(400).json({ success: false, message: 'All fields are required' });

        const verifyCode = await prisma.verifyCode.findFirst({
            where: { email, code, type: 'reset', used: false, expiresAt: { gte: new Date() } },
            orderBy: { createdAt: 'desc' }
        });
        if (!verifyCode) return res.status(400).json({ success: false, message: 'Invalid or expired code' });

        const hashedPassword = await bcrypt.hash(password, 10);
        await prisma.user.update({ where: { email }, data: { password: hashedPassword } });
        await prisma.verifyCode.update({ where: { id: verifyCode.id }, data: { used: true } });

        res.json({ success: true, message: 'Password reset successful' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Get current user
router.get('/me', auth, async (req, res) => {
    // Lazy settlement: process any expired robot orders for instant feedback
    const { processExpiredOrders } = require('./robot');
    processExpiredOrders().catch(err => console.error('Lazy settlement error:', err.message));

    const user = req.user;
    res.json({
        success: true,
        data: {
            id: user.id,
            email: user.email,
            nickname: user.nickname,
            avatar: user.avatar,
            vipLevel: user.vipLevel,
            inviteCode: user.inviteCode,
            kycStatus: user.kycStatus,
            isAdmin: user.isAdmin,
            createdAt: user.createdAt,
            hasTransactionPassword: !!user.transactionPassword
        }
    });
});

module.exports = router;
