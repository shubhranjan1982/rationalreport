const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const fetch = require('node-fetch');
const { query, queryOne } = require('../config/database');
const { generateUUID, getISTDateTime } = require('../utils/helpers');
const { requireActiveSubscription, getClientId } = require('../middleware/auth');

async function getKiteSettings(clientId) {
  if (clientId) {
    const s = await queryOne('SELECT * FROM analyst_settings WHERE client_id = ? LIMIT 1', [clientId]);
    if (s) return s;
  }
  return await queryOne('SELECT * FROM analyst_settings LIMIT 1');
}

async function kiteRequest(url, accessToken = null, method = 'GET', postData = null) {
  const headers = { 'X-Kite-Version': '3' };
  if (accessToken) headers['Authorization'] = `token ${accessToken}`;
  const options = { method, headers, timeout: 30000 };
  if (method === 'POST' && postData) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    options.body = new URLSearchParams(postData).toString();
  }
  const resp = await fetch(url, options);
  const body = await resp.text();
  return { body, code: resp.status };
}

function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const vals = line.split(',').map(v => v.replace(/"/g, '').trim());
    if (vals.length !== header.length) continue;
    const obj = {};
    header.forEach((h, j) => { obj[h] = vals[j]; });
    rows.push(obj);
  }
  return rows;
}

router.get('/status', requireActiveSubscription, async (req, res) => {
  try {
    const clientId = getClientId(req);
    const settings = await getKiteSettings(clientId);
    let connected = false, expiry = '';
    if (settings && settings.kite_access_token && settings.kite_token_expiry) {
      const expiryTime = new Date(settings.kite_token_expiry).getTime();
      connected = expiryTime > Date.now();
      expiry = settings.kite_token_expiry;
    }
    res.json({ connected, expiry, hasApiKey: !!(settings && settings.kite_api_key) });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.get('/login-url', requireActiveSubscription, async (req, res) => {
  try {
    const clientId = getClientId(req);
    const settings = await getKiteSettings(clientId);
    if (!settings || !settings.kite_api_key) return res.status(400).json({ message: 'Kite API Key not configured in Settings' });

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers.host;
    const callbackUrl = `${protocol}://${host}/api/kite/callback`;
    const loginUrl = `https://kite.zerodha.com/connect/login?v=3&api_key=${settings.kite_api_key}&redirect_url=${encodeURIComponent(callbackUrl)}`;
    res.json({ loginUrl, callbackUrl });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.get('/callback', async (req, res) => {
  try {
    const requestToken = req.query.request_token || '';
    const status = req.query.status || '';

    if (status !== 'success' || !requestToken) {
      return res.send(`<html><body><h2>Kite Login Failed</h2><p>Status: ${status}</p><script>setTimeout(function(){window.close()},3000)</script></body></html>`);
    }

    const settings = await getKiteSettings(null);
    if (!settings || !settings.kite_api_key || !settings.kite_api_secret) {
      return res.send('<html><body><h2>Kite API Key/Secret not configured</h2><script>setTimeout(function(){window.close()},3000)</script></body></html>');
    }

    const checksum = crypto.createHash('sha256').update(settings.kite_api_key + requestToken + settings.kite_api_secret).digest('hex');
    const result = await kiteRequest('https://api.kite.trade/session/token', null, 'POST', {
      api_key: settings.kite_api_key, request_token: requestToken, checksum,
    });

    const data = JSON.parse(result.body);
    if (!data || data.status !== 'success') {
      return res.send(`<html><body><h2>Session Failed</h2><p>${data?.message || 'Unknown error'}</p><script>setTimeout(function(){window.close()},3000)</script></body></html>`);
    }

    const accessToken = settings.kite_api_key + ':' + data.data.access_token;
    const now = new Date();
    const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    istNow.setDate(istNow.getDate() + 1);
    istNow.setHours(6, 0, 0, 0);
    const y = istNow.getFullYear();
    const m = String(istNow.getMonth() + 1).padStart(2, '0');
    const d = String(istNow.getDate()).padStart(2, '0');
    const expiry = `${y}-${m}-${d}T06:00:00`;

    await query('UPDATE analyst_settings SET kite_access_token = ?, kite_token_expiry = ? WHERE id = ?', [accessToken, expiry, settings.id]);

    res.send('<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2 style="color:#16a34a">Kite Connected Successfully!</h2><p>You can close this window.</p><script>setTimeout(function(){window.close()},2000)</script></body></html>');
  } catch (err) { console.error(err); res.status(500).send('<html><body><h2>Error</h2></body></html>'); }
});

router.get('/instruments', requireActiveSubscription, async (req, res) => {
  try {
    const clientId = getClientId(req);
    const settings = await getKiteSettings(clientId);
    if (!settings || !settings.kite_access_token) return res.status(400).json({ message: 'Kite not connected' });

    const result = await kiteRequest('https://api.kite.trade/instruments/NFO', settings.kite_access_token);
    if (result.code !== 200) return res.status(400).json({ message: 'Failed to fetch instruments' });

    const rows = parseCSV(result.body);
    const instruments = rows.filter(r => r.instrument_type === 'FUT' && r.segment === 'NFO-FUT');
    res.json({ instruments, count: instruments.length });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.post('/fetch-oi', requireActiveSubscription, async (req, res) => {
  try {
    const clientId = getClientId(req);
    const settings = await getKiteSettings(clientId);
    if (!settings || !settings.kite_access_token) return res.status(400).json({ message: 'Kite not connected. Please login to Kite first.' });

    if (settings.kite_token_expiry && new Date(settings.kite_token_expiry).getTime() < Date.now()) {
      return res.status(400).json({ message: 'Kite session expired. Please re-login.' });
    }

    const instrResult = await kiteRequest('https://api.kite.trade/instruments/NFO', settings.kite_access_token);
    if (instrResult.code !== 200) return res.status(400).json({ message: 'Failed to fetch instruments from Kite' });

    const rows = parseCSV(instrResult.body);
    const futInstruments = rows.filter(r => r.instrument_type === 'FUT' && r.segment === 'NFO-FUT');
    if (futInstruments.length === 0) return res.status(400).json({ message: 'No FUT instruments found' });

    const symbolExpiries = {};
    const nearMonthInstr = {};
    for (const instr of futInstruments) {
      const sym = instr.name || '';
      const exp = instr.expiry || '';
      if (!sym || !exp) continue;
      if (!symbolExpiries[sym] || exp < symbolExpiries[sym]) {
        symbolExpiries[sym] = exp;
        nearMonthInstr[sym] = instr;
      }
    }

    const tradingSymbols = [];
    const instrMap = {};
    for (const [sym, instr] of Object.entries(nearMonthInstr)) {
      const ts = `NFO:${instr.tradingsymbol}`;
      tradingSymbols.push(ts);
      instrMap[ts] = instr;
    }

    const oiData = [];
    const batchSize = 200;
    for (let i = 0; i < tradingSymbols.length; i += batchSize) {
      const batch = tradingSymbols.slice(i, i + batchSize);
      const queryStr = batch.map(s => `i=${encodeURIComponent(s)}`).join('&');
      const quoteUrl = `https://api.kite.trade/quote?${queryStr}`;
      const quoteResult = await kiteRequest(quoteUrl, settings.kite_access_token);
      if (quoteResult.code !== 200) continue;

      const quoteData = JSON.parse(quoteResult.body);
      if (!quoteData || quoteData.status !== 'success') continue;

      for (const [key, quote] of Object.entries(quoteData.data)) {
        const instr = instrMap[key];
        if (!instr) continue;

        const oi = quote.oi || 0;
        const lastPrice = quote.last_price || 0;
        const prevClose = (quote.ohlc && quote.ohlc.close) || 0;
        const volume = quote.volume || 0;
        const lotSize = parseInt(instr.lot_size || '1');
        const oiDayLow = quote.oi_day_low || 0;
        let prevOi = oiDayLow > 0 ? oiDayLow : oi;
        if (oiDayLow > 0 && oiDayLow < oi) prevOi = oiDayLow;
        const oiChange = oi - prevOi;
        const oiChangePct = prevOi > 0 ? ((oi - prevOi) / prevOi) * 100 : 0;
        const priceChange = lastPrice - prevClose;
        const priceChangePct = prevClose > 0 ? ((lastPrice - prevClose) / prevClose) * 100 : 0;

        let buildupType = 'Neutral';
        if (oiChangePct > 0 && priceChangePct > 0) buildupType = 'Long Buildup';
        else if (oiChangePct > 0 && priceChangePct < 0) buildupType = 'Short Buildup';
        else if (oiChangePct < 0 && priceChangePct > 0) buildupType = 'Short Covering';
        else if (oiChangePct < 0 && priceChangePct < 0) buildupType = 'Long Unwinding';

        oiData.push({
          symbol: instr.name, latestOI: oi, oiChange, oiChangePct: Math.round(oiChangePct * 100) / 100,
          futuresPrice: lastPrice, priceChange: Math.round(priceChange * 100) / 100,
          priceChangePct: Math.round(priceChangePct * 100) / 100, volume, lotSize, buildupType,
        });
      }
    }

    oiData.sort((a, b) => Math.abs(b.oiChangePct) - Math.abs(a.oiChangePct));

    const ist = getISTDateTime();
    const snapshotId = generateUUID();
    await query(
      "INSERT INTO oi_snapshots (id, client_id, snapshot_date, snapshot_time, data_source, data) VALUES (?, ?, ?, ?, 'kite', ?)",
      [snapshotId, clientId, ist.iso, ist.time, JSON.stringify(oiData)]
    );

    res.json({ data: oiData, count: oiData.length, snapshotId, timestamp: `${ist.date} ${ist.time}`, source: 'kite' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.get('/latest-snapshot', requireActiveSubscription, async (req, res) => {
  try {
    const clientId = getClientId(req);
    let sql = 'SELECT * FROM oi_snapshots WHERE 1=1';
    const params = [];
    if (clientId) { sql += ' AND client_id = ?'; params.push(clientId); }
    sql += ' ORDER BY created_at DESC LIMIT 1';
    const snapshot = await queryOne(sql, params);
    if (!snapshot) return res.json({ data: [], count: 0, timestamp: null, source: null });

    const data = JSON.parse(snapshot.data);
    res.json({ data, count: data.length, timestamp: `${snapshot.snapshot_date} ${snapshot.snapshot_time}`, source: snapshot.data_source, snapshotId: snapshot.id });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.post('/paste-oi', requireActiveSubscription, async (req, res) => {
  try {
    const clientId = getClientId(req);
    const rawText = req.body.text || '';
    if (!rawText) return res.status(400).json({ message: 'No data provided' });

    const lines = rawText.trim().split('\n');
    const oiData = [];
    for (const line of lines) {
      const cols = line.trim().split(/\t+/);
      if (cols.length < 5) continue;
      if (cols[0].toLowerCase() === 'symbol' || cols[0].toLowerCase() === 'name') continue;

      const symbol = cols[0].toUpperCase().trim();
      const latestOI = parseFloat(cols[1].replace(/,/g, '') || '0');
      const oiChange = parseFloat(cols[2].replace(/,/g, '') || '0');
      const oiChangePct = parseFloat((cols[3] || '0').replace(/[%,]/g, ''));
      const price = parseFloat(cols[4].replace(/,/g, '') || '0');
      const priceChange = cols[5] ? parseFloat(cols[5].replace(/,/g, '')) : 0;
      const priceChangePct = cols[6] ? parseFloat(cols[6].replace(/[%,]/g, '')) : 0;
      const volume = cols[7] ? parseFloat(cols[7].replace(/,/g, '')) : 0;
      const lotSize = cols[8] ? parseInt(cols[8].replace(/,/g, '')) : 1;

      let buildupType = 'Neutral';
      if (oiChangePct > 0 && priceChangePct > 0) buildupType = 'Long Buildup';
      else if (oiChangePct > 0 && priceChangePct < 0) buildupType = 'Short Buildup';
      else if (oiChangePct < 0 && priceChangePct > 0) buildupType = 'Short Covering';
      else if (oiChangePct < 0 && priceChangePct < 0) buildupType = 'Long Unwinding';

      oiData.push({
        symbol, latestOI, oiChange, oiChangePct: Math.round(oiChangePct * 100) / 100,
        futuresPrice: price, priceChange: Math.round(priceChange * 100) / 100,
        priceChangePct: Math.round(priceChangePct * 100) / 100, volume, lotSize, buildupType,
      });
    }

    if (oiData.length === 0) return res.status(400).json({ message: 'Could not parse any data from pasted text' });

    const ist = getISTDateTime();
    const snapshotId = generateUUID();
    await query(
      "INSERT INTO oi_snapshots (id, client_id, snapshot_date, snapshot_time, data_source, data) VALUES (?, ?, ?, ?, 'paste', ?)",
      [snapshotId, clientId, ist.iso, ist.time, JSON.stringify(oiData)]
    );

    res.json({ data: oiData, count: oiData.length, snapshotId, timestamp: `${ist.date} ${ist.time}`, source: 'paste' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.post('/link-trade', requireActiveSubscription, async (req, res) => {
  try {
    const clientId = getClientId(req);
    const tradeId = req.body.tradeId || '';
    if (!tradeId) return res.status(400).json({ message: 'Trade ID required' });

    let tradeSql = 'SELECT * FROM trades WHERE id = ?';
    const tradeParams = [tradeId];
    if (clientId) { tradeSql += ' AND client_id = ?'; tradeParams.push(clientId); }
    const trade = await queryOne(tradeSql, tradeParams);
    if (!trade) return res.status(404).json({ message: 'Trade not found' });

    let snapSql = 'SELECT * FROM oi_snapshots WHERE 1=1';
    const snapParams = [];
    if (clientId) { snapSql += ' AND client_id = ?'; snapParams.push(clientId); }
    snapSql += ' ORDER BY created_at DESC LIMIT 1';
    const snapshot = await queryOne(snapSql, snapParams);
    if (!snapshot) return res.status(400).json({ message: 'No OI data available' });

    const data = JSON.parse(snapshot.data);
    const match = data.find(item => item.symbol.toUpperCase() === trade.stock_name.toUpperCase());

    if (match) {
      await query('UPDATE trades SET oi_buildup_type = ?, oi_change_pct = ? WHERE id = ?', [match.buildupType, match.oiChangePct, tradeId]);
    }
    res.json({ success: true, match: match || null });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
