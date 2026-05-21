// api/data.js
// Vercel Serverless Function to proxy cloud database requests and bypass CORS
const DB_URL = 'https://jsonbin-zeta.vercel.app/api/bins/LaH3DFwkrP';

module.exports = async (req, res) => {
    // Enable CORS for local testing (e.g. file:/// or localhost)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        if (req.method === 'GET') {
            const response = await fetch(DB_URL);
            if (!response.ok) {
                throw new Error(`Failed to fetch from DB: ${response.statusText}`);
            }
            const data = await response.json();
            // JSONBin returns { "data": { "bookings": [...], "blocked_dates": [...] } }
            // Let's normalize it to return the inner data
            const innerData = data.data || data;
            res.status(200).json(innerData);
        } else if (req.method === 'PUT' || req.method === 'POST') {
            // Forward the payload to JSONBin
            const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            
            const response = await fetch(DB_URL, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Failed to save to DB: ${response.statusText}`);
            }

            const result = await response.json();
            res.status(200).json(result);
        } else {
            res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (error) {
        console.error("Serverless API Error:", error);
        res.status(500).json({ error: error.message });
    }
};
