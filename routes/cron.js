const router = require('express').Router();
const { processExpiredOrders } = require('./robot');

// Vercel Cron Job endpoint — called automatically every hour
// Also callable manually: GET /api/cron/process-robots
router.get('/process-robots', async (req, res) => {
    try {
        console.log(`[CRON] ${new Date().toISOString()} — Processing expired robot orders...`);
        await processExpiredOrders();
        res.json({ success: true, message: 'Robot settlement executed', time: new Date().toISOString() });
    } catch (err) {
        console.error('[CRON ERROR]', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
