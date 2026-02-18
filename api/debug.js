module.exports = (req, res) => {
    res.status(200).json({
        status: 'debug_ok',
        message: 'Function execution works!',
        env: {
            NODE_ENV: process.env.NODE_ENV,
            HAS_DATABASE_URL: !!process.env.DATABASE_URL,
            HAS_JWT_SECRET: !!process.env.JWT_SECRET
        },
        time: new Date().toISOString()
    });
};
