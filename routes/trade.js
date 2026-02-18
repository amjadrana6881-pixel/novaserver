const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { auth } = require('../middleware/auth');
const prisma = new PrismaClient();

// Create spot order
router.post('/spot', auth, async (req, res) => {
    try {
        const { pair, side, type, price, amount } = req.body;
        if (!pair || !side || !type || !price || !amount) return res.status(400).json({ success: false, message: 'All fields required' });

        const [base, quote] = pair.split('/');
        const coin = side === 'buy' ? quote : base;
        const needed = side === 'buy' ? price * amount : amount;

        // Check balance
        const wallet = await prisma.wallet.findUnique({
            where: { userId_coin_account: { userId: req.user.id, coin, account: 'spot' } }
        });
        if (!wallet || wallet.available < needed) return res.status(400).json({ success: false, message: `Insufficient ${coin} balance` });

        // For market orders, fill immediately
        if (type === 'market') {
            const receiveCoin = side === 'buy' ? base : quote;
            const receiveAmount = side === 'buy' ? amount : price * amount;

            await prisma.$transaction([
                prisma.wallet.update({ where: { id: wallet.id }, data: { available: { decrement: needed } } }),
                prisma.wallet.upsert({
                    where: { userId_coin_account: { userId: req.user.id, coin: receiveCoin, account: 'spot' } },
                    update: { available: { increment: receiveAmount } },
                    create: { userId: req.user.id, coin: receiveCoin, account: 'spot', available: receiveAmount }
                })
            ]);

            const order = await prisma.spotOrder.create({
                data: { userId: req.user.id, pair, side, type, price: parseFloat(price), amount: parseFloat(amount), filled: parseFloat(amount), status: 'filled' }
            });
            return res.json({ success: true, data: order, message: 'Order filled' });
        }

        // Limit order — freeze funds
        await prisma.wallet.update({ where: { id: wallet.id }, data: { available: { decrement: needed }, frozen: { increment: needed } } });
        const order = await prisma.spotOrder.create({
            data: { userId: req.user.id, pair, side, type, price: parseFloat(price), amount: parseFloat(amount) }
        });
        res.json({ success: true, data: order, message: 'Limit order placed' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Create contract order
router.post('/contract', auth, async (req, res) => {
    try {
        const { pair, side, leverage, margin } = req.body;
        if (!pair || !side || !leverage || !margin) return res.status(400).json({ success: false, message: 'All fields required' });

        const wallet = await prisma.wallet.findUnique({
            where: { userId_coin_account: { userId: req.user.id, coin: 'USDT', account: 'contract' } }
        });
        if (!wallet || wallet.available < margin) return res.status(400).json({ success: false, message: 'Insufficient contract margin' });

        const entryPrice = 96500; // would come from live price feed
        await prisma.wallet.update({ where: { id: wallet.id }, data: { available: { decrement: parseFloat(margin) }, frozen: { increment: parseFloat(margin) } } });

        const order = await prisma.contractOrder.create({
            data: { userId: req.user.id, pair, side, leverage: parseInt(leverage), margin: parseFloat(margin), entryPrice }
        });
        res.json({ success: true, data: order });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Close contract
router.post('/contract/:id/close', auth, async (req, res) => {
    try {
        const order = await prisma.contractOrder.findFirst({ where: { id: req.params.id, userId: req.user.id, status: 'open' } });
        if (!order) return res.status(404).json({ success: false, message: 'Open contract not found' });

        const exitPrice = 96500 + (Math.random() - 0.5) * 2000;
        const priceDiff = order.side === 'long' ? exitPrice - order.entryPrice : order.entryPrice - exitPrice;
        const pnl = (priceDiff / order.entryPrice) * order.margin * order.leverage;

        const returnAmount = order.margin + pnl;

        await prisma.$transaction([
            prisma.contractOrder.update({ where: { id: order.id }, data: { exitPrice, pnl, status: 'closed' } }),
            prisma.wallet.update({
                where: { userId_coin_account: { userId: req.user.id, coin: 'USDT', account: 'contract' } },
                data: { frozen: { decrement: order.margin }, available: { increment: Math.max(0, returnAmount) } }
            })
        ]);

        res.json({ success: true, data: { pnl: pnl.toFixed(2), returnAmount: Math.max(0, returnAmount).toFixed(2) } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Get orders
router.get('/spot', auth, async (req, res) => {
    try {
        const { status } = req.query;
        const where = { userId: req.user.id };
        if (status) where.status = status;
        const orders = await prisma.spotOrder.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 });
        res.json({ success: true, data: orders });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/contract', auth, async (req, res) => {
    try {
        const { status } = req.query;
        const where = { userId: req.user.id };
        if (status) where.status = status;
        const orders = await prisma.contractOrder.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 });
        res.json({ success: true, data: orders });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Cancel spot order
router.delete('/spot/:id', auth, async (req, res) => {
    try {
        const order = await prisma.spotOrder.findFirst({ where: { id: req.params.id, userId: req.user.id, status: 'open' } });
        if (!order) return res.status(404).json({ success: false, message: 'Open order not found' });

        const [base, quote] = order.pair.split('/');
        const coin = order.side === 'buy' ? quote : base;
        const amount = order.side === 'buy' ? order.price * (order.amount - order.filled) : order.amount - order.filled;

        await prisma.$transaction([
            prisma.spotOrder.update({ where: { id: order.id }, data: { status: 'cancelled' } }),
            prisma.wallet.update({
                where: { userId_coin_account: { userId: req.user.id, coin, account: 'spot' } },
                data: { frozen: { decrement: amount }, available: { increment: amount } }
            })
        ]);

        res.json({ success: true, message: 'Order cancelled' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
