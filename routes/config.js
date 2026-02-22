const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { auth, adminAuth } = require('../middleware/auth');
const prisma = new PrismaClient();

// Public: Get site config
router.get('/public', async (req, res) => {
    try {
        const configs = await prisma.siteConfig.findMany();
        const configMap = {};
        configs.forEach(c => configMap[c.key] = c.value);

        // Return default structure if keys missing
        res.json({
            success: true,
            data: {
                announcement: configMap.announcement || 'Welcome to NovaTrade!',
                deposit_addresses: JSON.parse(configMap.deposit_addresses || '[]'),
                referral_rates: JSON.parse(configMap.referral_rates || '[{"level":"V-V4","l1":10,"l2":3,"l3":1}]'),
                support_link: configMap.support_link || '',
                app_download_link: configMap.app_download_link || '',
                trc20_binance: process.env.BINANCE_USDT_TRC20 || '',
                erc20_binance: process.env.BINANCE_USDT_ERC20 || ''
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Admin: Get all config
router.get('/admin', adminAuth, async (req, res) => {
    try {
        const configs = await prisma.siteConfig.findMany();
        const configMap = {};
        configs.forEach(c => configMap[c.key] = c.value);
        res.json({ success: true, data: configMap });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Admin: Update config
router.put('/', adminAuth, async (req, res) => {
    try {
        const updates = req.body; // { key: value, key2: value2 }
        const promises = Object.keys(updates).map(key => {
            let val = updates[key];
            if (typeof val === 'object') val = JSON.stringify(val);
            return prisma.siteConfig.upsert({
                where: { key },
                update: { value: val },
                create: { key, value: val }
            });
        });

        await Promise.all(promises);
        res.json({ success: true, message: 'Settings updated' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
