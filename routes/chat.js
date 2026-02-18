const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { auth } = require('../middleware/auth');
const prisma = new PrismaClient();

// Get chat messages
router.get('/', auth, async (req, res) => {
    try {
        const messages = await prisma.chatMessage.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: 'asc' },
            take: 100
        });

        // If no messages, add welcome
        if (messages.length === 0) {
            const welcome = await prisma.chatMessage.create({
                data: { userId: req.user.id, message: 'Welcome to NovaTrade Support! 👋 How can I help you today?', fromBot: true }
            });
            return res.json({ success: true, data: [welcome] });
        }

        res.json({ success: true, data: messages });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Send message
router.post('/', auth, async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ success: false, message: 'Message required' });

        // Save user message
        const userMsg = await prisma.chatMessage.create({
            data: { userId: req.user.id, message, fromBot: false }
        });

        // Auto reply
        const lowerMsg = message.toLowerCase();
        let reply = `Thank you for your message. Our support team has received your inquiry and will respond within 24 hours. For urgent matters, contact support@novatrade.com`;

        if (lowerMsg.includes('deposit')) reply = '💰 To deposit: Go to Assets > Deposit, select your coin and network, copy the deposit address, and send funds. Deposits are reviewed within 30 minutes.';
        else if (lowerMsg.includes('withdraw')) reply = '💸 To withdraw: Go to Assets > Withdraw, enter the amount and destination address. Make sure you have set your transaction password. Withdrawals are processed within 24 hours.';
        else if (lowerMsg.includes('kyc') || lowerMsg.includes('verify')) reply = '🪪 To complete KYC: Go to Profile > Identity Authentication. Upload your ID (front & back) and a selfie. Verification takes 1-3 business days.';
        else if (lowerMsg.includes('robot') || lowerMsg.includes('ai')) reply = '🤖 Our AI robots automatically trade 24/7 to earn daily returns. Go to the AI tab to see available robots and their return rates. The Basic robot starts at just 50 USDT!';
        else if (lowerMsg.includes('vip') || lowerMsg.includes('upgrade')) reply = '⬆️ VIP levels: V (free) to V8 (highest). Higher levels unlock better robots, higher withdrawal limits, and consultant salary. Go to Profile > Upgrade to see requirements.';
        else if (lowerMsg.includes('password')) reply = '🔐 To change your password: Go to Profile > Account Settings > Modify Login Password. For transaction password: Account Settings > Modify Transaction Password.';

        const botMsg = await prisma.chatMessage.create({
            data: { userId: req.user.id, message: reply, fromBot: true }
        });

        res.json({ success: true, data: { userMsg, botMsg } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Admin: get all user chats
router.get('/admin/chats', async (req, res) => {
    try {
        const chats = await prisma.chatMessage.groupBy({ by: ['userId'], _count: { id: true }, _max: { createdAt: true }, orderBy: { _max: { createdAt: 'desc' } } });
        res.json({ success: true, data: chats });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
