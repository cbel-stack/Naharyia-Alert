const OREF_HEADERS = {
  'X-Requested-With': 'XMLHttpRequest',
  'Referer': 'https://www.oref.org.il/',
  'Origin': 'https://www.oref.org.il',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

const THREAT_TITLE = {
  1: 'ירי רקטות וטילים',
  3: 'חדירת כלי טיס עוין',
  6: 'איום בלתי קונבנציונלי',
};

async function fetchOref() {
  const response = await fetch('https://www.oref.org.il/WarningMessages/alert/alerts.json', {
    headers: OREF_HEADERS
  });
  if (!response.ok) throw new Error(`oref HTTP ${response.status}`);

  const text = await response.text();
  const clean = text.replace(/^\uFEFF/, '').trim();
  if (!clean || clean === '' || clean === 'null') return { status: 'none', source: 'oref' };

  const data = JSON.parse(clean);
  if (!data || !data.data || data.data.length === 0) return { status: 'none', source: 'oref' };

  return { status: 'active', alert: data, source: 'oref' };
}

async function fetchTzevaadom() {
  const response = await fetch('https://api.tzevaadom.co.il/notifications', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  if (!response.ok) throw new Error(`tzevaadom HTTP ${response.status}`);

  const alerts = await response.json();
  if (!Array.isArray(alerts) || alerts.length === 0) return { status: 'none', source: 'tzevaadom' };

  const alert = alerts[0];
  const title = THREAT_TITLE[alert.threat] || 'ירי רקטות וטילים';

  return {
    status: 'active',
    alert: {
      id: String(alert.id || ''),
      cat: String(alert.threat || '1'),
      title,
      data: alert.cities || alert.towns || [],
      desc: ''
    },
    source: 'tzevaadom'
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const errors = [];

  // Try oref first — handles explicit all-clear ("האירוע הסתיים")
  try {
    const result = await fetchOref();
    return res.status(200).json(result);
  } catch (e) {
    errors.push(`oref: ${e.message}`);
  }

  // Fallback: tzevaadom
  try {
    const result = await fetchTzevaadom();
    return res.status(200).json(result);
  } catch (e) {
    errors.push(`tzevaadom: ${e.message}`);
  }

  // Both failed
  return res.status(200).json({
    status: 'none',
    apiError: errors.join(' | ')
  });
}
