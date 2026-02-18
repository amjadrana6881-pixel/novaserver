const { PrismaClient } = require('@prisma/client');

// Use a separate prisma client instance for check
const prisma = new PrismaClient();

module.exports = async (req, res) => {
    try {
        // Simple query
        const count = await prisma.user.count();
        res.status(200).json({
            status: 'db_ok',
            userCount: count,
            message: 'Database connection successful'
        });
    } catch (error) {
        console.error('DB Check Failed:', error);
        res.status(500).json({
            status: 'db_error',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    } finally {
        await prisma.$disconnect();
    }
};
