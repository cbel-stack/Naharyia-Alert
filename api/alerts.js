const CITY_HE     = 'נהריה';
const CITY_ID     = 1499;   // Nahariya city ID in tzevaadom
const AREA_ID     = 6;      // Nahariya area ID in tzevaadom
const MAX_AGE_MS  = 60 * 60 * 1000; // 60 minutes

const THREAT_TITLE = {
  1: 'ירי רקטות וטילים',
  3: 'חדירת כלי טיס עוין',
  6: 'חדירת כלי טיס עוין',
};

// ── tzevaadom /ios/feed ────────────────────────────────────────────────────
// Returns current state for Nahariya based on:
//   - systemMessages: official all-clear from Pikud HaOref
//   - (active alerts handled separately by /notifications)
async function fetchIosFeed() {
  const res = await fetch('https://api.tzevaadom.co.il/ios/feed', {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Origin': 'https://www.tzevaadom.co.il'
    }
  });
  if (!res.ok) throw new Error(`ios/feed HTTP ${res.status}`);
  return res.json();
}

// ── tzevaadom /notifications ───────────────────────────────────────────────
async function fetchNotifications() {
  const res = await fetch('https://api.tzevaadom.co.il/notifications', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  if (!res.ok) throw new Error(`notifications HTTP ${res.status}`);
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const now = Date.now();
  const errors = [];

  // alertStart (seconds) passed by client when already in alert state.
  // All-clear systemMessages older than alertStart are ignored.
  const alertStartSec = req.query.alertStart ? parseInt(req.query.alertStart, 10) : 0;

  try {
    const [feed, notifications] = await Promise.all([
      fetchIosFeed().catch(e => { errors.push(e.message); return null; }),
      fetchNotifications().catch(e => { errors.push(e.message); return null; })
    ]);

    // ── 1. Check active alerts for Nahariya in /notifications ─────────────
    // Use filter (not find) to capture simultaneous drone + rocket alerts
    if (Array.isArray(notifications) && notifications.length > 0) {
      const nahariyaAlerts = notifications.filter(a => {
        const cities = a.cities || a.towns || [];
        return cities.some(c => c.includes(CITY_HE));
      });

      if (nahariyaAlerts.length > 0) {
        return res.status(200).json({
          status: 'active',
          source: 'tzevaadom-notifications',
          alerts: nahariyaAlerts.map(a => ({
            title: THREAT_TITLE[a.threat] || 'ירי רקטות וטילים',
            data:  a.cities || a.towns || [],
            cat:   String(a.threat || '1')
          }))
        });
      }
    }

    // ── 2. Check recent all-clear for Nahariya in /ios/feed systemMessages ─
    if (feed && Array.isArray(feed.systemMessages)) {
      const recentAllClear = feed.systemMessages.find(msg => {
        // Must be an end-of-event message
        const isEndEvent = (msg.titleHe || '').includes('סיום') ||
                           (msg.titleEn || '').toLowerCase().includes('ended') ||
                           (msg.instructionType === 1);
        if (!isEndEvent) return false;

        // Must be recent (within 60 min)
        const msgTime = (msg.time || 0) * 1000;
        if (now - msgTime > MAX_AGE_MS) return false;

        // Must be AFTER the current alert started (avoids picking up old events)
        if (alertStartSec && (msg.time || 0) < alertStartSec) return false;

        // Must include Nahariya's area or city
        const areas  = msg.areasIds  || [];
        const cities = msg.citiesIds || [];
        return areas.includes(AREA_ID) || cities.includes(CITY_ID);
      });

      if (recentAllClear) {
        return res.status(200).json({
          status: 'active',
          source: 'tzevaadom-allclear',
          alert: {
            title: 'האירוע הסתיים',
            data: [CITY_HE],
            cat: '13'
          }
        });
      }
    }

    // ── 3. No active alert, no recent all-clear ────────────────────────────
    return res.status(200).json({
      status: 'none',
      source: 'tzevaadom',
      ...(errors.length ? { apiError: errors.join(' | ') } : {})
    });

  } catch (e) {
    return res.status(200).json({ status: 'none', apiError: e.message });
  }
}
