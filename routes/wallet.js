const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { auth } = require('../middleware/auth');
const prisma = new PrismaClient();

// Get all wallets
router.get('/', auth, async (req, res) => {
    try {
        const { account } = req.query;
        const where = { userId: req.user.id };
        if (account) where.account = account;

        const wallets = await prisma.wallet.findMany({ where, orderBy: { coin: 'asc' } });

        // Calculate total USDT value (simplified)
        const prices = { USDT: 1, BTC: 96500, ETH: 3200, BNB: 620, XRP: 2.4, SOL: 180, DOGE: 0.32, ADA: 0.98, DOT: 7.5, AVAX: 35, MATIC: 0.85, LINK: 18, UNI: 12, LTC: 125, ATOM: 9.5, TRX: 0.22, SHIB: 0.000022, FIL: 5.5 };
        let totalUSD = 0;
        wallets.forEach(w => { totalUSD += (w.available + w.frozen) * (prices[w.coin] || 0); });

        res.json({ success: true, data: { wallets, totalUSD, totalBTC: totalUSD / (prices.BTC || 96500) } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Get specific wallet
router.get('/:coin', auth, async (req, res) => {
    try {
        const { account = 'spot' } = req.query;
        const wallet = await prisma.wallet.findUnique({
            where: { userId_coin_account: { userId: req.user.id, coin: req.params.coin.toUpperCase(), account } }
        });
        res.json({ success: true, data: wallet || { coin: req.params.coin.toUpperCase(), available: 0, frozen: 0 } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Transfer between accounts
router.post('/transfer', auth, async (req, res) => {
    try {
        const { coin, from, to, amount } = req.body;
        if (!coin || !from || !to || !amount || amount <= 0) return res.status(400).json({ success: false, message: 'Invalid transfer params' });
        if (from === to) return res.status(400).json({ success: false, message: 'From and To must be different' });

        // Check source balance
        const sourceWallet = await prisma.wallet.findUnique({
            where: { userId_coin_account: { userId: req.user.id, coin, account: from } }
        });
        if (!sourceWallet || sourceWallet.available < amount) return res.status(400).json({ success: false, message: 'Insufficient balance' });

        // Transfer
        await prisma.$transaction([
            prisma.wallet.update({ where: { id: sourceWallet.id }, data: { available: { decrement: amount } } }),
            prisma.wallet.upsert({
                where: { userId_coin_account: { userId: req.user.id, coin, account: to } },
                update: { available: { increment: amount } },
                create: { userId: req.user.id, coin, account: to, available: amount }
            })
        ]);

        res.json({ success: true, message: `Transferred ${amount} ${coin} from ${from} to ${to}` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
