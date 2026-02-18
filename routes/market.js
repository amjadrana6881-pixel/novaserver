const router = require('express').Router();

// Proxy CoinGecko market data
router.get('/prices', async (req, res) => {
    try {
        const { vs_currency = 'usd', per_page = 30, page = 1 } = req.query;
        const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=${vs_currency}&order=market_cap_desc&per_page=${per_page}&page=${page}&sparkline=false`;

        const response = await fetch(url);
        if (!response.ok) throw new Error('CoinGecko API error');

        const data = await response.json();
        res.json({ success: true, data });
    } catch (err) {
        // Fallback mock data
        const mockData = [
            { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: 96500, price_change_percentage_24h: 1.25, market_cap: 1900000000000 },
            { id: 'ethereum', symbol: 'eth', name: 'Ethereum', current_price: 3200, price_change_percentage_24h: -0.50, market_cap: 380000000000 },
            { id: 'tether', symbol: 'usdt', name: 'Tether', current_price: 1.00, price_change_percentage_24h: 0.01, market_cap: 95000000000 },
            { id: 'binancecoin', symbol: 'bnb', name: 'BNB', current_price: 620, price_change_percentage_24h: 2.10, market_cap: 90000000000 },
            { id: 'ripple', symbol: 'xrp', name: 'XRP', current_price: 2.40, price_change_percentage_24h: -1.30, market_cap: 55000000000 },
            { id: 'solana', symbol: 'sol', name: 'Solana', current_price: 180, price_change_percentage_24h: 3.50, market_cap: 45000000000 },
            { id: 'dogecoin', symbol: 'doge', name: 'Dogecoin', current_price: 0.32, price_change_percentage_24h: 5.20, market_cap: 23000000000 },
            { id: 'cardano', symbol: 'ada', name: 'Cardano', current_price: 0.98, price_change_percentage_24h: -2.10, market_cap: 18000000000 },
            { id: 'polkadot', symbol: 'dot', name: 'Polkadot', current_price: 7.50, price_change_percentage_24h: 0.80, market_cap: 10000000000 },
            { id: 'avalanche-2', symbol: 'avax', name: 'Avalanche', current_price: 35, price_change_percentage_24h: 1.90, market_cap: 8000000000 },
        ];
        res.json({ success: true, data: mockData, fallback: true });
    }
});

// Get single coin price
router.get('/price/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const ids = { btc: 'bitcoin', eth: 'ethereum', bnb: 'binancecoin', xrp: 'ripple', sol: 'solana', doge: 'dogecoin', ada: 'cardano', dot: 'polkadot', avax: 'avalanche-2', usdt: 'tether' };
        const coinId = ids[symbol.toLowerCase()] || symbol.toLowerCase();

        const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`);
        const data = await response.json();
        res.json({ success: true, data });
    } catch (err) {
        res.json({ success: true, data: { [req.params.symbol]: { usd: 0 } }, fallback: true });
    }
});

module.exports = router;
