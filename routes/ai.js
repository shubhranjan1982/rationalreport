const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const multer = require('multer');
const { query, queryOne } = require('../config/database');
const { requireActiveSubscription, getClientId } = require('../middleware/auth');

router.use(requireActiveSubscription);

const upload = multer({ storage: multer.memoryStorage() });

async function getAISettings(clientId) {
  if (clientId) {
    const s = await queryOne('SELECT * FROM analyst_settings WHERE client_id = ? LIMIT 1', [clientId]);
    if (s) return s;
  }
  return await queryOne('SELECT * FROM analyst_settings LIMIT 1');
}

async function callGeminiAPI(apiKey, prompt, images = []) {
  const parts = [];
  for (const img of images) {
    parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } });
  }
  parts.push({ text: prompt });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
    }),
    timeout: 60000,
  });
  const data = await resp.json();
  if (resp.status !== 200) return { error: 'API call failed with code ' + resp.status, raw: JSON.stringify(data) };
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return { text };
}

async function callOpenAIAPI(apiKey, prompt, images = []) {
  const content = [];
  for (const img of images) {
    content.push({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.base64}` } });
  }
  content.push({ type: 'text', text: prompt });

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o', messages: [{ role: 'user', content }],
      max_tokens: 4096, temperature: 0.3,
    }),
    timeout: 60000,
  });
  const data = await resp.json();
  const text = data?.choices?.[0]?.message?.content || '';
  return { text };
}

async function callAI(settings, prompt, images = []) {
  const provider = settings.ai_provider || 'gemini';
  const apiKey = settings.ai_api_key || '';
  if (!apiKey) return { error: 'AI API Key not configured in Settings' };
  if (provider === 'openai') return callOpenAIAPI(apiKey, prompt, images);
  return callGeminiAPI(apiKey, prompt, images);
}

router.post('/analyze-signals', upload.any(), async (req, res) => {
  try {
    const clientId = getClientId(req);
    const settings = await getAISettings(clientId);
    if (!settings || !settings.ai_api_key) return res.status(400).json({ message: 'AI API Key not configured. Go to Settings to set it up.' });

    const images = [];
    if (req.files) {
      for (const file of req.files) {
        images.push({ mimeType: file.mimetype || 'image/png', base64: file.buffer.toString('base64') });
      }
    }
    if (images.length === 0) return res.status(400).json({ message: 'At least one screenshot is required' });

    const tradeId = req.body.tradeId || '';
    const numImages = images.length;
    let scenario = '';
    if (numImages === 1) scenario = 'This is a STOP LOSS HIT scenario (Loss trade). Extract details from this single screenshot.';
    else if (numImages === 2) scenario = 'This is a simple ENTRY and EXIT scenario. Image 1 = Entry signal, Image 2 = Exit signal.';
    else if (numImages === 3) scenario = 'This is a SL HIT then RE-ENTRY scenario. Image 1 = Entry, Image 2 = SL Hit (loss), Image 3 = Re-entry and profit exit.';
    else if (numImages === 4) scenario = 'This is a PROFIT then RE-ENTRY scenario. Image 1 = Entry, Image 2 = First target hit (profit), Image 3 = Re-entry, Image 4 = Second exit.';

    const prompt = `You are a trade signal analyst. Analyze these Telegram trading signal screenshots.
${scenario}

Extract the following in JSON format:
{
  "stockName": "STOCK NAME (e.g., NIFTY, BANKNIFTY, RELIANCE)",
  "strikePrice": 22500,
  "optionType": "CE or PE",
  "entryPrice": 150.00,
  "exitPrice": 180.00,
  "stopLoss": 130.00,
  "lotSize": 25,
  "profitLoss": 30.00,
  "status": "closed",
  "tradeType": "INTRADAY",
  "segment": "INDEX OPTION or STOCK OPTION",
  "isReentry": false,
  "summary": "Brief description of the trade"
}

Rules:
- profitLoss = exitPrice - entryPrice (for CE/CALL). For PE/PUT, if entry > exit it's profit
- lot size from the signal (LOT SIZE N)
- P&L amount = profitLoss * lotSize * 2
- If SL hit, status should be 'closed' with negative profitLoss
- Return ONLY valid JSON, no markdown`;

    const result = await callAI(settings, prompt, images);
    if (result.error) return res.status(400).json({ message: result.error });

    let text = result.text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    const parsed = JSON.parse(text.trim());

    if (tradeId) {
      let verifySql = 'SELECT id FROM trades WHERE id = ?';
      const verifyParams = [tradeId];
      if (clientId) { verifySql += ' AND client_id = ?'; verifyParams.push(clientId); }
      const existing = await queryOne(verifySql, verifyParams);
      if (!existing) return res.status(404).json({ message: 'Trade not found or access denied' });

      const sets = [];
      const params = [];
      const fieldMap = {
        stockName: 'stock_name', optionType: 'option_type', strikePrice: 'strike_price',
        lotSize: 'lot_size', entryPrice: 'entry_price', exitPrice: 'exit_price',
        stopLoss: 'stop_loss', profitLoss: 'profit_loss_amount',
        status: 'status', tradeType: 'trade_type', segment: 'segment',
      };
      for (const [js, db] of Object.entries(fieldMap)) {
        if (parsed[js] !== undefined) { sets.push(`${db} = ?`); params.push(parsed[js]); }
      }
      if (parsed.isReentry !== undefined) { sets.push('is_reentry = ?'); params.push(parsed.isReentry ? 1 : 0); }
      if (sets.length > 0) {
        params.push(tradeId);
        await query('UPDATE trades SET ' + sets.join(', ') + ' WHERE id = ?', params);
      }
    }

    res.json({ analysis: parsed, tradeId });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.post('/generate-rationale', async (req, res) => {
  try {
    const clientId = getClientId(req);
    const settings = await getAISettings(clientId);
    if (!settings || !settings.ai_api_key) return res.status(400).json({ message: 'AI API Key not configured' });

    const { tradeId } = req.body;
    if (!tradeId) return res.status(400).json({ message: 'Trade ID required' });

    let tradeSql = 'SELECT * FROM trades WHERE id = ?';
    const tradeParams = [tradeId];
    if (clientId) { tradeSql += ' AND client_id = ?'; tradeParams.push(clientId); }
    const trade = await queryOne(tradeSql, tradeParams);
    if (!trade) return res.status(404).json({ message: 'Trade not found or access denied' });

    const images = [];
    const charts = JSON.parse(trade.chart_screenshots || '[]');
    for (const chart of charts) {
      const chartPath = path.join(__dirname, '..', chart.path);
      if (fs.existsSync(chartPath)) {
        const base64 = fs.readFileSync(chartPath).toString('base64');
        const ext = path.extname(chartPath).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
        images.push({ mimeType, base64 });
      }
    }

    const prompt = `You are a SEBI Registered Research Analyst. Generate a professional rationale report for this trade.

Trade Details:
- Stock: ${trade.stock_name} ${trade.strike_price} ${trade.option_type}
- Segment: ${trade.segment} | Type: ${trade.trade_type}
- Entry: ${trade.entry_price} | Exit: ${trade.exit_price}
- Lot Size: ${trade.lot_size} | P/L: ${trade.profit_loss_amount}
- Date: ${trade.trade_date}

${images.length > 0 ? 'I have attached chart screenshots. Analyze them to identify technical patterns, support/resistance levels, and indicators used.\n\n' : ''}

Write a professional rationale covering:
1. Market Context (what was happening in the broader market)
2. Technical Analysis (chart patterns, indicators, support/resistance)
3. Entry Rationale (why this entry point was chosen)
4. Risk Management (stop loss placement logic)
5. Exit Strategy (target levels, trailing stop)
6. Trade Outcome and Lessons

Keep it professional, suitable for SEBI compliance documentation. 300-500 words.`;

    const result = await callAI(settings, prompt, images);
    if (result.error) return res.status(400).json({ message: result.error });

    await query("UPDATE trades SET rationale = ?, strategy = 'Technical Analysis (AI Generated)' WHERE id = ?", [result.text, tradeId]);

    res.json({ rationale: result.text, tradeId });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
