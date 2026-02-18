const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { auth, adminAuth } = require('../middleware/auth');
const prisma = new PrismaClient();

// Get active activities
router.get('/', async (req, res) => {
    try {
        const activities = await prisma.activity.findMany({
            where: { isActive: true, endDate: { gte: new Date() } },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ success: true, data: activities });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Get activity detail
router.get('/:id', async (req, res) => {
    try {
        const activity = await prisma.activity.findUnique({ where: { id: req.params.id } });
        if (!activity) return res.status(404).json({ success: false, message: 'Activity not found' });
        res.json({ success: true, data: activity });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Admin: Create activity
router.post('/', adminAuth, async (req, res) => {
    try {
        const { title, description, content, bgColor, startDate, endDate } = req.body;
        if (!title || !startDate || !endDate) return res.status(400).json({ success: false, message: 'Title and dates required' });

        const activity = await prisma.activity.create({
            data: {
                title, description, content, bgColor: bgColor || '#1A6CFF',
                startDate: new Date(startDate),
                endDate: new Date(endDate)
            }
        });
        res.json({ success: true, data: activity });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
