import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

interface InstitutionalHolder {
    holder: string;
    shares: string;
    dateReported: string;
    out: string;
    value: string;
}

app.get('/api/scrape/institutional-holders', async (req, res) => {
    const { symbol } = req.query;

    if (!symbol || typeof symbol !== 'string') {
        return res.status(400).json({ error: 'Symbol is required' });
    }

    try {
        // MarketBeat URL structure: https://www.marketbeat.com/stocks/NASDAQ/AAPL/institutional-ownership/
        // Note: Exchange might differ (NYSE vs NASDAQ). We might need to try both or guess.
        // Let's try NASDAQ first, then NYSE if 404.
        let url = `https://www.marketbeat.com/stocks/NASDAQ/${symbol}/institutional-ownership/`;
        console.log(`Scraping ${url}...`);

        let response;
        try {
            response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
        } catch (err: any) {
            console.log(`NASDAQ failed (${err.message}), trying NYSE...`);
            // Try NYSE
            url = `https://www.marketbeat.com/stocks/NYSE/${symbol}/institutional-ownership/`;
            console.log(`Scraping ${url}...`);
            try {
                response = await axios.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                });
            } catch (err2: any) {
                console.log(`NYSE failed (${err2.message}).`);
                throw err2;
            }
        }

        const $ = cheerio.load(response.data);
        const holders: InstitutionalHolder[] = [];

        // MarketBeat usually has a table with class "scroll-table" or similar.
        // We look for a table where headers include "Institution" and "Shares"

        $('table').each((i, table) => {
            const headers = $(table).find('th').map((j, th) => $(th).text().trim()).get();
            // MarketBeat headers: "Reporting Date", "Institution", "Shares", "Value", "Change", "% Ownership"
            if (headers.some(h => h.includes('Institution')) && headers.some(h => h.includes('Shares'))) {
                $(table).find('tbody tr').each((k, row) => {
                    const cols = $(row).find('td').map((l, col) => $(col).text().trim()).get();
                    // Columns might vary, but usually:
                    // 0: Date, 1: Institution, 2: Activity (Buy/Sell), 3: Shares, 4: Value, ...
                    // Let's inspect the headers to map correctly, or just guess based on standard layout.

                    // Simple mapping based on observation:
                    // Date | Institution | Action | Shares | Value | ...
                    if (cols.length >= 4) {
                        holders.push({
                            holder: cols[1] || 'Unknown', // Institution
                            shares: cols[3] || '0',        // Shares
                            dateReported: cols[0] || '',   // Date
                            out: '',                       // Not always available directly
                            value: cols[4] || ''           // Value
                        });
                    }
                });
                return false; // Break loop
            }
        });

        console.log(`Found ${holders.length} holders for ${symbol}`);
        res.json({ symbol, holders });

    } catch (error) {
        console.error('Scraping error:', error);
        res.status(500).json({ error: 'Failed to scrape data', details: error instanceof Error ? error.message : String(error) });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
