const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { auth } = require('../middleware/auth');
const prisma = new PrismaClient();

// Create deposit request
router.post('/', auth, async (req, res) => {
    try {
        const { coin, network, amount, txHash, proof, address } = req.body;
        if (!coin || !network || !amount || amount <= 0) return res.status(400).json({ success: false, message: 'Invalid deposit params' });

        const deposit = await prisma.deposit.create({
            data: {
                userId: req.user.id,
                coin,
                network,
                amount: parseFloat(amount),
                address: address || 'N/A',
                txHash: txHash || null,
                proof: proof || null
            }
        });

        await prisma.notification.create({
            data: { userId: req.user.id, type: 'transaction', title: 'Deposit Submitted', content: `Your deposit of ${amount} ${coin} is pending review.` }
        });

        res.json({ success: true, data: deposit });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Get user deposits
router.get('/', auth, async (req, res) => {
    try {
        const { status, coin } = req.query;
        const where = { userId: req.user.id };
        if (status) where.status = status;
        if (coin) where.coin = coin;

        const deposits = await prisma.deposit.findMany({ where, orderBy: { createdAt: 'desc' } });
        res.json({ success: true, data: deposits });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Get deposit address
router.get('/address/:coin/:network', auth, (req, res) => {
    const { coin, network } = req.params;
    const addresses = {
        TRC20: `T${req.user.id.slice(0, 8)}...novatrade`,
        ERC20: `0x${req.user.id.slice(0, 8)}...novatrade`,
        BEP20: `bnb${req.user.id.slice(0, 8)}...novatrade`,
    };
    res.json({ success: true, data: { coin, network, address: addresses[network] || addresses.TRC20, qrCode: null } });
});

module.exports = router;
