const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const auth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, message: 'No token provided' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
        if (!user || !user.isActive) return res.status(401).json({ success: false, message: 'Invalid token' });

        req.user = user;
        next();
    } catch (err) {
        res.status(401).json({ success: false, message: 'Authentication failed' });
    }
};

const adminAuth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, message: 'No token provided' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
        if (!user || !user.isAdmin) return res.status(403).json({ success: false, message: 'Admin access required' });

        req.user = user;
        next();
    } catch (err) {
        res.status(403).json({ success: false, message: 'Admin authentication failed' });
    }
};

module.exports = { auth, adminAuth };
