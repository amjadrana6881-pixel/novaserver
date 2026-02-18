const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { auth } = require('../middleware/auth');
const prisma = new PrismaClient();

// Get notifications
router.get('/', auth, async (req, res) => {
    try {
        const { type, unread } = req.query;
        const where = { userId: req.user.id };
        if (type) where.type = type;
        if (unread === 'true') where.isRead = false;

        const notifications = await prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 });
        const unreadCount = await prisma.notification.count({ where: { userId: req.user.id, isRead: false } });

        res.json({ success: true, data: { notifications, unreadCount } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Mark as read
router.put('/:id/read', auth, async (req, res) => {
    try {
        await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.user.id }, data: { isRead: true } });
        res.json({ success: true, message: 'Marked as read' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Mark all as read
router.put('/read-all', auth, async (req, res) => {
    try {
        await prisma.notification.updateMany({ where: { userId: req.user.id, isRead: false }, data: { isRead: true } });
        res.json({ success: true, message: 'All notifications marked as read' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
