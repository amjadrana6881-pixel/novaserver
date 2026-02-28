const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { auth } = require('../middleware/auth');
const prisma = new PrismaClient();

// Get all robots
router.get('/', async (req, res) => {
    try {
        const robots = await prisma.robot.findMany({ where: { isActive: true }, orderBy: { price: 'asc' } });
        res.json({ success: true, data: robots });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Settle expired orders (can be called manually or by cron)
router.get('/settle', async (req, res) => {
    try {
        console.log(`[SETTLE] ${new Date().toISOString()} — Processing expired robot orders...`);
        await processExpiredOrders();
        res.json({ success: true, message: 'Robot settlement executed', time: new Date().toISOString() });
    } catch (err) {
        console.error('[SETTLE ERROR]', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// Purchase robot
router.post('/purchase', auth, async (req, res) => {
    try {
        const { robotId } = req.body;
        if (!robotId) return res.status(400).json({ success: false, message: 'Robot ID required' });

        const robot = await prisma.robot.findUnique({ where: { id: robotId } });
        if (!robot || !robot.isActive) return res.status(404).json({ success: false, message: 'Robot not found' });

        // Check USDT balance (no VIP level restriction - just need enough balance)
        const wallet = await prisma.wallet.findUnique({
            where: { userId_coin_account: { userId: req.user.id, coin: 'USDT', account: 'spot' } }
        });
        if (!wallet || wallet.available < robot.price) return res.status(400).json({ success: false, message: 'Insufficient USDT balance' });

        // Fixed 3-day period 
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + (robot.period || 3));

        await prisma.$transaction([
            prisma.wallet.update({ where: { id: wallet.id }, data: { available: { decrement: robot.price } } }),
            prisma.robotOrder.create({
                data: { userId: req.user.id, robotId: robot.id, amount: robot.price, endDate }
            })
        ]);

        const profitText = robot.fixedProfit > 0
            ? `Fixed profit: ${robot.fixedProfit} USDT`
            : `Daily return: ${robot.dailyReturn}%`;

        await prisma.notification.create({
            data: { userId: req.user.id, type: 'system', title: 'Staking Plan Activated', content: `${robot.name} plan activated! ${profitText}, Lock period: ${robot.period || 3} days.` }
        });

        res.json({ success: true, message: `${robot.name} staking plan activated successfully` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Get my robot orders
router.get('/orders', auth, async (req, res) => {
    try {
        // Trigger lazy settlement check
        processExpiredOrders().catch(err => console.error('Lazy settlement error:', err));

        const { status } = req.query;
        const where = { userId: req.user.id };
        if (status) where.status = status;

        const orders = await prisma.robotOrder.findMany({ where, include: { robot: true }, orderBy: { startDate: 'desc' } });
        res.json({ success: true, data: orders });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Process expired orders (run by scheduler)
const processExpiredOrders = async () => {
    try {
        const now = new Date();
        // Find active orders that have ended
        const orders = await prisma.robotOrder.findMany({
            where: { status: 'running', endDate: { lte: now } },
            include: { user: true, robot: true }
        });

        for (const order of orders) {
            // Calculate return
            let profit = 0;
            if (order.robot.fixedProfit > 0) {
                profit = order.robot.fixedProfit;
            } else {
                profit = order.amount * (order.robot.dailyReturn / 100) * order.robot.period;
            }
            const totalReturn = order.amount + profit;

            // Transaction: Credit user, mark order completed
            await prisma.$transaction(async (tx) => {
                // 1. Update wallet (Principal + Profit)
                const wallet = await tx.wallet.findUnique({
                    where: { userId_coin_account: { userId: order.userId, coin: 'USDT', account: 'spot' } }
                });

                if (wallet) {
                    await tx.wallet.update({
                        where: { id: wallet.id },
                        data: { available: { increment: totalReturn } }
                    });
                }

                // 2. Mark order completed
                await tx.robotOrder.update({
                    where: { id: order.id },
                    data: { status: 'completed', earned: profit } // Assuming 'earned' field exists or we just track status
                });

                // 3. Create notification
                const notification = await tx.notification.create({
                    data: {
                        userId: order.userId,
                        type: 'system',
                        title: 'Staking Plan Matured',
                        content: `Your ${order.robot.name} plan has matured. Returned: ${totalReturn.toFixed(2)} USDT (Profit: ${profit.toFixed(2)} USDT).`
                    }
                });

                // 4. Emit Real-time Notification
                const { sendNotification } = require('../utils/socket');
                sendNotification(order.userId, {
                    id: notification.id,
                    title: notification.title,
                    content: notification.content,
                    type: notification.type,
                    createdAt: notification.createdAt
                });

                // 5. Distribute Commissions (6 Levels)
                const commissionRates = [0.15, 0.10, 0.07, 0.05, 0.03, 0.02];
                const user = await tx.user.findUnique({ where: { id: order.userId } });

                let currentInviterCode = user.invitedBy;
                for (let level = 1; level <= 6; level++) {
                    if (!currentInviterCode) break;

                    const upline = await tx.user.findUnique({ where: { inviteCode: currentInviterCode } });
                    if (!upline) break;

                    const commissionAmount = profit * commissionRates[level - 1];
                    if (commissionAmount > 0) {
                        await distributeCommission(tx, upline.id, commissionAmount, level, order.userId);
                    }

                    currentInviterCode = upline.invitedBy;
                }
            });
        }
        if (orders.length > 0) console.log(`Processed ${orders.length} expired robot orders.`);
    } catch (err) {
        console.error('Error processing orders:', err.message);
    }
};

// Helper: Distribute commission
async function distributeCommission(tx, userId, amount, level, fromUserId) {
    // Credit wallet
    // Check if wallet exists, if not create/ignore (users should have wallets on creation)
    const wallet = await tx.wallet.findUnique({
        where: { userId_coin_account: { userId, coin: 'USDT', account: 'spot' } }
    });

    if (wallet) {
        await tx.wallet.update({
            where: { id: wallet.id },
            data: { available: { increment: amount } }
        });

        // Record & Notify
        const notification = await tx.notification.create({
            data: {
                userId,
                type: 'system',
                title: 'Commission Received',
                content: `You received ${amount.toFixed(4)} USDT commission (Level ${level}) from a team member's staking returns.`
            }
        });

        // Real-time Socket Notification
        const { sendNotification } = require('../utils/socket');
        sendNotification(userId, {
            id: notification.id,
            title: notification.title,
            content: notification.content,
            type: notification.type,
            createdAt: notification.createdAt
        });
    }
}

module.exports = { router, processExpiredOrders };
