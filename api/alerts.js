export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const response = await fetch('https://www.oref.org.il/WarningMessages/alert/alerts.json', {
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://www.oref.org.il/',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)'
      }
    });

    const text = await response.text();

    // Remove BOM and whitespace
    const clean = text.replace(/^\uFEFF/, '').trim();

    if (!clean || clean === '' || clean === 'null') {
      return res.status(200).json({ status: 'none' });
    }

    const data = JSON.parse(clean);

    if (!data || !data.data || data.data.length === 0) {
      return res.status(200).json({ status: 'none' });
    }

    return res.status(200).json({ status: 'active', alert: data });

  } catch (error) {
    console.error('Pikud HaOref fetch error:', error.message);
    return res.status(200).json({ status: 'none', error: error.message });
  }
}
