
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

async function seedAdmin() {
    try {
        const email = 'admin@novatrade.com';
        const existing = await prisma.user.findUnique({ where: { email } });

        if (!existing) {
            console.log('Creating admin user...');
            const hashedPassword = await bcrypt.hash('Admin@123', 10);
            await prisma.user.create({
                data: {
                    email,
                    password: hashedPassword,
                    inviteCode: 'ADMIN1',
                    nickname: 'Super Admin',
                    isAdmin: true,
                    vipLevel: 'V4',
                    kycStatus: 'approved'
                }
            });
            console.log('✅ Admin user created: admin@novatrade.com / Admin@123');
        } else {
            console.log('ℹ️ Admin user already exists.');
        }
    } catch (err) {
        console.error('Error seeding admin:', err);
    } finally {
        await prisma.$disconnect();
    }
}

seedAdmin();
