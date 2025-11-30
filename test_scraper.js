async function test() {
    try {
        const res = await fetch('http://localhost:3001/api/scrape/institutional-holders?symbol=AAPL');
        console.log('Status:', res.status);
        if (res.ok) {
            const data = await res.json();
            console.log('Data:', JSON.stringify(data, null, 2));
        } else {
            console.log('Error:', await res.text());
        }
    } catch (err) {
        console.error('Fetch failed:', err);
    }
}
test();
