const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { auth } = require('../middleware/auth');
const prisma = new PrismaClient();

// Apply for loan
router.post('/', auth, async (req, res) => {
    try {
        const { amount } = req.body;
        if (!amount || amount <= 0) return res.status(400).json({ success: false, message: 'Invalid amount' });

        // Check VIP level eligibility
        const tierLimits = { V1: 1000, V2: 2000, V3: 3000, V4: 4000 };
        const level = req.user.vipLevel;
        const maxCredit = tierLimits[level];
        if (!maxCredit) return res.status(400).json({ success: false, message: 'V1+ required for loans' });
        if (amount > maxCredit) return res.status(400).json({ success: false, message: `Max credit for ${level}: ${maxCredit} USDT` });

        // Check existing active loan
        const activeLoan = await prisma.loan.findFirst({ where: { userId: req.user.id, status: 'active' } });
        if (activeLoan) return res.status(400).json({ success: false, message: 'You already have an active loan' });

        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 10);

        const loan = await prisma.loan.create({
            data: { userId: req.user.id, amount: parseFloat(amount), repayAmount: parseFloat(amount) * 1.05, dueDate }
        });

        // Credit to wallet
        await prisma.wallet.update({
            where: { userId_coin_account: { userId: req.user.id, coin: 'USDT', account: 'spot' } },
            data: { available: { increment: parseFloat(amount) } }
        });

        res.json({ success: true, data: loan });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Get loans
router.get('/', auth, async (req, res) => {
    try {
        const loans = await prisma.loan.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } });
        res.json({ success: true, data: loans });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Repay loan
router.post('/:id/repay', auth, async (req, res) => {
    try {
        const loan = await prisma.loan.findFirst({ where: { id: req.params.id, userId: req.user.id, status: 'active' } });
        if (!loan) return res.status(404).json({ success: false, message: 'Active loan not found' });

        const wallet = await prisma.wallet.findUnique({
            where: { userId_coin_account: { userId: req.user.id, coin: 'USDT', account: 'spot' } }
        });
        if (!wallet || wallet.available < loan.repayAmount) return res.status(400).json({ success: false, message: 'Insufficient balance' });

        await prisma.$transaction([
            prisma.wallet.update({ where: { id: wallet.id }, data: { available: { decrement: loan.repayAmount } } }),
            prisma.loan.update({ where: { id: loan.id }, data: { status: 'repaid' } })
        ]);

        res.json({ success: true, message: 'Loan repaid' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
