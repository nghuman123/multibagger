import { config } from 'dotenv';

config(); // Load .env

async function test() {
  console.log("=== Testing APIs ===");
  
  // Test FMP
  console.log("\n[FMP] Testing...");
  const fmpKey = process.env.FMP_API_KEY;
  if (fmpKey) {
    try {
      const url = `https://financialmodelingprep.com/api/v3/quote/AAPL?apikey=${fmpKey}`;
      const res = await fetch(url);
      console.log(`Status: ${res.status}`);
      if (res.ok) {
        const data = await res.json();
        console.log("Success! Data:", data[0]?.symbol, data[0]?.price);
      } else {
        const text = await res.text();
        console.error("Error body:", text);
      }
    } catch (e) {
      console.error("Fetch error:", e);
    }
  } else {
    console.log("No FMP_API_KEY found.");
  }

  // Test Finnhub
  console.log("\n[Finnhub] Testing...");
  const finnhubKey = process.env.FINNHUB_API_KEY;
  if (finnhubKey) {
    try {
      const url = `https://finnhub.io/api/v1/quote?symbol=AAPL&token=${finnhubKey}`;
      const res = await fetch(url);
      console.log(`Status: ${res.status}`);
      if (res.ok) {
        const data = await res.json();
        console.log("Success! Data:", data);
      } else {
        const text = await res.text();
        console.error("Error body:", text);
      }
    } catch (e) {
      console.error("Fetch error:", e);
    }
  } else {
    console.log("No FINNHUB_API_KEY found.");
  }

  // Test Massive/Polygon
  console.log("\n[Massive/Polygon] Testing...");
  const massiveKey = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY;
  if (massiveKey) {
    try {
      const url = `https://api.polygon.io/v2/aggs/ticker/AAPL/prev?apiKey=${massiveKey}`;
      const res = await fetch(url);
      console.log(`Status: ${res.status}`);
      if (res.ok) {
        const data = await res.json();
        console.log("Success! Data:", data.results?.[0]);
      } else {
        const text = await res.text();
        console.error("Error body:", text);
      }
    } catch (e) {
      console.error("Fetch error:", e);
    }
  } else {
    console.log("No MASSIVE_API_KEY or POLYGON_API_KEY found.");
  }
}

test();
