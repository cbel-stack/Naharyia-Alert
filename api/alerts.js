const OREF_HEADERS = {
  'X-Requested-With': 'XMLHttpRequest',
  'Referer': 'https://www.oref.org.il/',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)'
};

async function fetchOref() {
  const response = await fetch('https://www.oref.org.il/WarningMessages/alert/alerts.json', {
    headers: OREF_HEADERS
  });

  if (!response.ok) throw new Error(`oref HTTP ${response.status}`);

  const text = await response.text();
  const clean = text.replace(/^\uFEFF/, '').trim();

  if (!clean || clean === '' || clean === 'null') return null;

  const data = JSON.parse(clean);
  if (!data || !data.data || data.data.length === 0) return null;

  return { status: 'active', alert: data, source: 'oref' };
}

// tzevaadom.co.il is a community proxy for oref — more accessible outside Israel
async function fetchTzevaadom() {
  const response = await fetch('https://api.tzevaadom.co.il/alerts', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });

  if (!response.ok) throw new Error(`tzevaadom HTTP ${response.status}`);

  const alerts = await response.json();
  if (!Array.isArray(alerts) || alerts.length === 0) return null;

  // Normalize to oref-compatible format
  // threat: 1=rockets, 3=drone/hostile aircraft, 6=unconventional
  const THREAT_TITLE = {
    1: 'ירי רקטות וטילים',
    3: 'חדירת כלי טיס עוין',
    6: 'איום בלתי קונבנציונלי',
  };

  const alert = alerts[0];
  const title = THREAT_TITLE[alert.threat] || 'ירי רקטות וטילים';

  return {
    status: 'active',
    alert: {
      id: String(alert.id || ''),
      cat: String(alert.threat || '1'),
      title,
      data: alert.cities || [],
      desc: ''
    },
    source: 'tzevaadom'
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const errors = [];

  // Try oref first
  try {
    const result = await fetchOref();
    if (result) return res.status(200).json(result);
  } catch (e) {
    errors.push(`oref: ${e.message}`);
  }

  // Fallback: tzevaadom community proxy
  try {
    const result = await fetchTzevaadom();
    if (result) return res.status(200).json(result);
  } catch (e) {
    errors.push(`tzevaadom: ${e.message}`);
  }

  // Both sources returned no active alert (or failed)
  const allFailed = errors.length === 2;
  return res.status(200).json({
    status: 'none',
    apiError: allFailed ? errors.join(' | ') : undefined
  });
}
