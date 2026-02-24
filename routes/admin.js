const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { adminAuth } = require('../middleware/auth');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

// [TEMPORARY] Seed admin user for Vercel (Visit /api/admin/seed once)
router.get('/seed', async (req, res) => {
    try {
        const email = 'admin@novatrade.com';

        // 1. Reactivate ALL existing admins just in case
        await prisma.user.updateMany({
            where: { isAdmin: true },
            data: { isActive: true }
        });

        // 2. Check for the specific default admin email and FORCE password reset
        const target = await prisma.user.findUnique({ where: { email } });
        const hashedPassword = await bcrypt.hash('Admin@123', 10);

        let finalUser;
        if (target) {
            finalUser = await prisma.user.update({
                where: { email },
                data: {
                    isActive: true,
                    isAdmin: true,
                    password: hashedPassword
                }
            });
        } else {
            finalUser = await prisma.user.create({
                data: {
                    email,
                    password: hashedPassword,
                    nickname: 'Admin',
                    vipLevel: 'V8',
                    inviteCode: 'ADMIN001',
                    isAdmin: true,
                    kycStatus: 'approved',
                    isActive: true
                }
            });
        }

        res.json({
            success: true,
            message: '✅ Admin setup complete.',
            user_in_db: {
                id: finalUser.id,
                email: finalUser.email,
                isAdmin: finalUser.isAdmin,
                isActive: finalUser.isActive
            },
            credentials_to_use: {
                email: 'admin@novatrade.com',
                password: 'Admin@123'
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Dashboard stats
router.get('/stats', adminAuth, async (req, res) => {
    try {
        const [userCount, depositCount, withdrawCount, robotOrderCount, pendingDeposits, pendingWithdrawals, pendingKYC] = await Promise.all([
            prisma.user.count(),
            prisma.deposit.count(),
            prisma.withdrawal.count(),
            prisma.robotOrder.count(),
            prisma.deposit.count({ where: { status: 'pending' } }),
            prisma.withdrawal.count({ where: { status: 'pending' } }),
            prisma.user.count({ where: { kycStatus: 'pending' } }),
        ]);

        const totalDeposited = await prisma.deposit.aggregate({ _sum: { amount: true }, where: { status: 'approved' } });
        const totalWithdrawn = await prisma.withdrawal.aggregate({ _sum: { amount: true }, where: { status: 'approved' } });

        res.json({ success: true, data: { userCount, depositCount, withdrawCount, robotOrderCount, pendingDeposits, pendingWithdrawals, pendingKYC, totalDeposited: totalDeposited._sum.amount || 0, totalWithdrawn: totalWithdrawn._sum.amount || 0 } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// List users
router.get('/users', adminAuth, async (req, res) => {
    try {
        const { page = 1, limit = 20, search } = req.query;
        const where = {};
        if (search) where.email = { contains: search };

        const [users, total] = await Promise.all([
            prisma.user.findMany({ where, skip: (page - 1) * limit, take: parseInt(limit), orderBy: { createdAt: 'desc' }, select: { id: true, email: true, nickname: true, vipLevel: true, kycStatus: true, kycName: true, kycIdNumber: true, kycCountry: true, kycIdFront: true, kycIdBack: true, kycSelfie: true, isActive: true, isAdmin: true, inviteCode: true, invitedBy: true, createdAt: true } }),
            prisma.user.count({ where })
        ]);
        res.json({ success: true, data: { users, total, page: parseInt(page), pages: Math.ceil(total / limit) } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Get full user details (referral tree, wallets, deposits, withdrawals, etc.)
router.get('/users/:id/details', adminAuth, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id },
            select: {
                id: true, email: true, nickname: true, vipLevel: true,
                kycStatus: true, kycName: true, kycIdNumber: true, kycCountry: true,
                isActive: true, inviteCode: true, invitedBy: true,
                createdAt: true, updatedAt: true
            }
        });
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        // Get referrer info (who invited this user)
        let referrer = null;
        if (user.invitedBy) {
            referrer = await prisma.user.findUnique({
                where: { inviteCode: user.invitedBy },
                select: { id: true, email: true, nickname: true, inviteCode: true, vipLevel: true }
            });
        }

        // Get downline (users this person referred)
        const downline = await prisma.user.findMany({
            where: { invitedBy: user.inviteCode },
            select: { id: true, email: true, nickname: true, vipLevel: true, kycStatus: true, inviteCode: true, createdAt: true },
            orderBy: { createdAt: 'desc' }
        });

        // Get wallet balances
        const wallets = await prisma.wallet.findMany({
            where: { userId: user.id },
            orderBy: { coin: 'asc' }
        });

        // Get recent deposits
        const deposits = await prisma.deposit.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' },
            take: 15
        });

        // Get recent withdrawals
        const withdrawals = await prisma.withdrawal.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' },
            take: 15
        });

        // Get withdrawal addresses
        const withdrawAddresses = await prisma.withdrawAddress.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' }
        });

        // Get active staking plans (robot orders)
        const stakingPlans = await prisma.robotOrder.findMany({
            where: { userId: user.id },
            include: { robot: { select: { name: true, price: true, fixedProfit: true, period: true } } },
            orderBy: { startDate: 'desc' },
            take: 15
        });

        res.json({
            success: true,
            data: {
                user,
                referrer,
                downline,
                downlineCount: downline.length,
                wallets,
                deposits,
                withdrawals,
                withdrawAddresses,
                stakingPlans
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Update user (VIP, active status, etc.)
router.put('/users/:id', adminAuth, async (req, res) => {
    try {
        const { vipLevel, isActive, kycStatus } = req.body;
        const data = {};
        if (vipLevel !== undefined) data.vipLevel = vipLevel;
        if (isActive !== undefined) data.isActive = isActive;
        if (kycStatus !== undefined) data.kycStatus = kycStatus;

        const user = await prisma.user.update({ where: { id: req.params.id }, data });
        res.json({ success: true, data: { id: user.id, email: user.email, vipLevel: user.vipLevel, isActive: user.isActive, kycStatus: user.kycStatus } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Manage user wallet (admin can add/deduct)
router.post('/users/:id/wallet', adminAuth, async (req, res) => {
    try {
        const { coin, amount, action, account = 'spot' } = req.body; // action: 'add' or 'deduct'
        if (!coin || !amount || !action) return res.status(400).json({ success: false, message: 'coin, amount, action required' });

        const wallet = await prisma.wallet.findUnique({
            where: { userId_coin_account: { userId: req.params.id, coin, account } }
        });

        if (action === 'add') {
            if (wallet) {
                await prisma.wallet.update({ where: { id: wallet.id }, data: { available: { increment: parseFloat(amount) } } });
            } else {
                await prisma.wallet.create({ data: { userId: req.params.id, coin, account, available: parseFloat(amount) } });
            }
        } else if (action === 'deduct') {
            if (!wallet || wallet.available < amount) return res.status(400).json({ success: false, message: 'Insufficient balance' });
            await prisma.wallet.update({ where: { id: wallet.id }, data: { available: { decrement: parseFloat(amount) } } });
        }

        res.json({ success: true, message: `${action === 'add' ? 'Added' : 'Deducted'} ${amount} ${coin}` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// List deposits
router.get('/deposits', adminAuth, async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const where = {};
        if (status) where.status = status;

        const [deposits, total] = await Promise.all([
            prisma.deposit.findMany({ where, skip: (page - 1) * limit, take: parseInt(limit), orderBy: { createdAt: 'desc' }, include: { user: { select: { email: true, vipLevel: true } } } }),
            prisma.deposit.count({ where })
        ]);
        res.json({ success: true, data: { deposits, total, page: parseInt(page) } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Review deposit
router.put('/deposits/:id', adminAuth, async (req, res) => {
    try {
        const { status, note } = req.body; // approved or rejected
        if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid status' });

        const deposit = await prisma.deposit.findUnique({ where: { id: req.params.id } });
        if (!deposit || deposit.status !== 'pending') return res.status(400).json({ success: false, message: 'Deposit not pending' });

        await prisma.deposit.update({ where: { id: deposit.id }, data: { status, reviewedBy: req.user.id, reviewNote: note || null } });

        if (status === 'approved') {
            // Credit wallet
            const wallet = await prisma.wallet.findUnique({
                where: { userId_coin_account: { userId: deposit.userId, coin: deposit.coin, account: 'spot' } }
            });
            if (wallet) {
                await prisma.wallet.update({ where: { id: wallet.id }, data: { available: { increment: deposit.amount } } });
            } else {
                await prisma.wallet.create({ data: { userId: deposit.userId, coin: deposit.coin, account: 'spot', available: deposit.amount } });
            }

            await prisma.notification.create({
                data: { userId: deposit.userId, type: 'transaction', title: 'Deposit Approved', content: `${deposit.amount} ${deposit.coin} credited to your spot wallet.` }
            });
        } else {
            await prisma.notification.create({
                data: { userId: deposit.userId, type: 'transaction', title: 'Deposit Rejected', content: `Your deposit of ${deposit.amount} ${deposit.coin} was rejected. ${note || ''}` }
            });
        }

        res.json({ success: true, message: `Deposit ${status}` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// List withdrawals
router.get('/withdrawals', adminAuth, async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const where = {};
        if (status) where.status = status;

        const [withdrawals, total] = await Promise.all([
            prisma.withdrawal.findMany({ where, skip: (page - 1) * limit, take: parseInt(limit), orderBy: { createdAt: 'desc' }, include: { user: { select: { email: true, vipLevel: true } } } }),
            prisma.withdrawal.count({ where })
        ]);
        res.json({ success: true, data: { withdrawals, total, page: parseInt(page) } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Review withdrawal
router.put('/withdrawals/:id', adminAuth, async (req, res) => {
    try {
        const { status, note, txHash } = req.body;
        if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid status' });

        const withdrawal = await prisma.withdrawal.findUnique({ where: { id: req.params.id } });
        if (!withdrawal || withdrawal.status !== 'pending') return res.status(400).json({ success: false, message: 'Withdrawal not pending' });

        await prisma.withdrawal.update({ where: { id: withdrawal.id }, data: { status, reviewedBy: req.user.id, reviewNote: note || null, txHash: txHash || null } });

        const wallet = await prisma.wallet.findUnique({
            where: { userId_coin_account: { userId: withdrawal.userId, coin: withdrawal.coin, account: 'spot' } }
        });

        if (status === 'approved') {
            // Remove frozen funds
            if (wallet) await prisma.wallet.update({ where: { id: wallet.id }, data: { frozen: { decrement: withdrawal.amount + withdrawal.fee } } });
            await prisma.notification.create({
                data: { userId: withdrawal.userId, type: 'transaction', title: 'Withdrawal Approved', content: `${withdrawal.amount} ${withdrawal.coin} sent to ${withdrawal.address}` }
            });
        } else {
            // Unfreeze funds
            if (wallet) await prisma.wallet.update({ where: { id: wallet.id }, data: { frozen: { decrement: withdrawal.amount + withdrawal.fee }, available: { increment: withdrawal.amount + withdrawal.fee } } });
            await prisma.notification.create({
                data: { userId: withdrawal.userId, type: 'transaction', title: 'Withdrawal Rejected', content: `Your withdrawal of ${withdrawal.amount} ${withdrawal.coin} was rejected. ${note || ''}` }
            });
        }

        res.json({ success: true, message: `Withdrawal ${status}` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Manage robots
router.get('/robots', adminAuth, async (req, res) => {
    try {
        const robots = await prisma.robot.findMany({ orderBy: { price: 'asc' } });
        res.json({ success: true, data: robots });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.put('/robots/:id', adminAuth, async (req, res) => {
    try {
        const { name, price, dailyReturn, fixedProfit, period, isActive } = req.body;
        const robot = await prisma.robot.update({
            where: { id: req.params.id },
            data: { ...(name && { name }), ...(price !== undefined && { price: parseFloat(price) }), ...(dailyReturn !== undefined && { dailyReturn: parseFloat(dailyReturn) }), ...(fixedProfit !== undefined && { fixedProfit: parseFloat(fixedProfit) }), ...(period !== undefined && { period: parseInt(period) }), ...(isActive !== undefined && { isActive }) }
        });
        res.json({ success: true, data: robot });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Manual Robot Settlement Trigger
router.post('/settle-robots', adminAuth, async (req, res) => {
    try {
        const { processExpiredOrders } = require('./robot');
        await processExpiredOrders();
        res.json({ success: true, message: 'Robot settlement process triggered successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
