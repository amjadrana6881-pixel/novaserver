const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { auth } = require('../middleware/auth');
const prisma = new PrismaClient();

// Create withdrawal request
router.post('/', auth, async (req, res) => {
    try {
        const { coin, network, amount, address, txPassword } = req.body;
        if (!coin || !network || !amount || !address || amount <= 0) return res.status(400).json({ success: false, message: 'Invalid withdrawal params' });

        // Verify transaction password
        if (!req.user.transactionPassword) return res.status(400).json({ success: false, message: 'Set transaction password first' });
        const validPwd = await bcrypt.compare(txPassword, req.user.transactionPassword);
        if (!validPwd) return res.status(400).json({ success: false, message: 'Invalid transaction password' });

        // Check balance
        const wallet = await prisma.wallet.findUnique({
            where: { userId_coin_account: { userId: req.user.id, coin, account: 'spot' } }
        });
        const fee = coin === 'USDT' ? 1 : 0.0001;
        if (!wallet || wallet.available < amount + fee) return res.status(400).json({ success: false, message: 'Insufficient balance' });

        // Freeze amount
        await prisma.wallet.update({ where: { id: wallet.id }, data: { available: { decrement: amount + fee }, frozen: { increment: amount + fee } } });

        const withdrawal = await prisma.withdrawal.create({
            data: { userId: req.user.id, coin, network, amount: parseFloat(amount), fee, address }
        });

        await prisma.notification.create({
            data: { userId: req.user.id, type: 'transaction', title: 'Withdrawal Submitted', content: `Your withdrawal of ${amount} ${coin} is pending review.` }
        });

        res.json({ success: true, data: withdrawal });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Get user withdrawals
router.get('/', auth, async (req, res) => {
    try {
        const { status } = req.query;
        const where = { userId: req.user.id };
        if (status) where.status = status;

        const withdrawals = await prisma.withdrawal.findMany({ where, orderBy: { createdAt: 'desc' } });
        res.json({ success: true, data: withdrawals });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
