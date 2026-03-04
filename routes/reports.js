const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { query, queryOne } = require('../config/database');
const { generateUUID, sanitize, getISTDateTime } = require('../utils/helpers');
const { requireActiveSubscription, getClientId, isOwner } = require('../middleware/auth');

router.use(requireActiveSubscription);

router.post('/consent', async (req, res) => {
  try {
    const { reportId, reportTitle, downloadFormat, disclaimerText } = req.body;
    if (!reportId || !disclaimerText) return res.status(400).json({ message: 'Report ID and disclaimer text are required' });

    let cId = '', cName = '', cEmail = '';
    if (isOwner(req)) {
      const user = await queryOne('SELECT * FROM users WHERE id = ?', [req.session.user_id]);
      cId = req.session.user_id; cName = user?.username || 'Owner'; cEmail = user?.email || '';
    } else {
      const client = await queryOne('SELECT * FROM clients WHERE id = ?', [req.session.client_id]);
      cId = req.session.client_id; cName = client?.name || ''; cEmail = client?.email || '';
    }

    const consentId = generateUUID();
    const ipAddress = (req.headers['x-forwarded-for'] || req.connection.remoteAddress || '').split(',')[0].trim();
    const userAgent = req.headers['user-agent'] || '';

    await query(
      'INSERT INTO report_consents (id, client_id, client_name, client_email, report_id, report_title, download_format, disclaimer_text, consent_given, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
      [consentId, cId, cName, cEmail, reportId, reportTitle || '', downloadFormat || 'pdf', disclaimerText, ipAddress, userAgent]
    );

    if (!req.session.report_consent_ids) req.session.report_consent_ids = {};
    req.session.report_consent_ids[reportId] = { consentId, ts: Math.floor(Date.now() / 1000) };

    res.json({ success: true, consentId });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

function getChartBase64(chartPath) {
  if (fs.existsSync(chartPath)) {
    const imgData = fs.readFileSync(chartPath).toString('base64');
    const ext = path.extname(chartPath).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
    return { base64: imgData, mime };
  }
  return { base64: null, mime: null };
}

async function getReportData(id, clientId) {
  const report = await queryOne('SELECT * FROM reports WHERE id = ?', [id]);
  if (!report) return null;
  if (clientId && report.client_id !== clientId) return { denied: true };

  const content = JSON.parse(report.content || '{}');
  const cId = clientId || report.client_id;
  let settings = null;
  if (cId) settings = await queryOne('SELECT * FROM analyst_settings WHERE client_id = ? LIMIT 1', [cId]);
  if (!settings) settings = await queryOne('SELECT * FROM analyst_settings LIMIT 1');

  const chartEntries = content.chartScreenshots || [];
  const charts = [];
  for (const chart of chartEntries) {
    const chartPath = path.join(__dirname, '..', chart.path);
    const { base64, mime } = getChartBase64(chartPath);
    charts.push({ timeframe: chart.timeframe, base64, mime });
  }

  return { report, content, settings, charts };
}

const tfLabels = {'1m':'1 Minute','2m':'2 Minutes','3m':'3 Minutes','5m':'5 Minutes','10m':'10 Minutes','15m':'15 Minutes','30m':'30 Minutes','1h':'1 Hour','4h':'4 Hours','1d':'Daily'};

function buildPdfHTML(report, settings, content, ist, charts) {
  const stockName = `${content.stockName || ''} ${content.strikePrice || ''} ${content.optionType || ''}`;
  const pl = content.profitLoss;
  const plStr = pl !== null && pl !== undefined ? (pl >= 0 ? '+' : '') + Number(pl).toFixed(2) + '/-' : 'N/A';

  let html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Rationale Report</title>';
  html += '<style>body{font-family:Arial,sans-serif;margin:40px;color:#333}h1{text-align:center;color:#1a1a2e}';
  html += '.header{text-align:center;border-bottom:2px solid #333;padding-bottom:15px;margin-bottom:20px}';
  html += 'table{width:100%;border-collapse:collapse;margin:15px 0}td{padding:8px;border:1px solid #ddd}';
  html += '.label{font-weight:bold;background:#f5f5f5;width:200px}.section{margin:20px 0}';
  html += '.section-title{font-size:16px;font-weight:bold;color:#1a1a2e;border-bottom:1px solid #ccc;padding-bottom:5px;margin-bottom:10px}';
  html += '.disclaimer{font-size:11px;color:#666;margin-top:30px;padding:15px;border:1px solid #ddd;background:#fafafa}';
  html += '.signature{margin-top:30px;padding:15px;border-top:2px solid #333}';
  html += '.chart-img{max-width:500px;margin:10px 0}';
  html += '@media print{body{margin:20px}.no-print{display:none}}</style></head><body>';

  html += '<div class="no-print" style="text-align:center;margin-bottom:20px"><button onclick="window.print()" style="padding:10px 30px;background:#1a1a2e;color:white;border:none;border-radius:5px;cursor:pointer;font-size:14px">Print / Save as PDF</button></div>';

  html += '<div class="header"><h1>RATIONALE REPORT</h1>';
  if (settings?.company_name) html += `<p style="font-size:18px">${sanitize(settings.company_name)}</p>`;
  html += `<p>Date: ${sanitize(report.trade_date)}</p></div>`;

  html += '<div class="section"><div class="section-title">ANALYST DETAILS</div>';
  html += `<table><tr><td class="label">Name</td><td>${sanitize(settings?.analyst_name || 'N/A')}</td></tr>`;
  html += `<tr><td class="label">SEBI Registration</td><td>${sanitize(settings?.sebi_reg_number || 'N/A')}</td></tr>`;
  html += `<tr><td class="label">Company</td><td>${sanitize(settings?.company_name || 'N/A')}</td></tr>`;
  if (settings?.website_url) html += `<tr><td class="label">Website</td><td>${sanitize(settings.website_url)}</td></tr>`;
  html += '</table></div>';

  html += '<div class="section"><div class="section-title">TRADE DETAILS</div><table>';
  html += `<tr><td class="label">Stock</td><td>${sanitize(stockName)}</td></tr>`;
  html += `<tr><td class="label">Segment</td><td>${sanitize(content.segment || 'N/A')}</td></tr>`;
  html += `<tr><td class="label">Trade Type</td><td>${sanitize(content.tradeType || 'N/A')}</td></tr>`;
  html += `<tr><td class="label">Entry Price</td><td>${sanitize(content.entryPrice || 'N/A')}</td></tr>`;
  html += `<tr><td class="label">Exit Price</td><td>${sanitize(content.exitPrice || 'N/A')}</td></tr>`;
  html += `<tr><td class="label">Lot Size</td><td>${sanitize(content.lotSize || 'N/A')}</td></tr>`;
  html += `<tr><td class="label">P/L (Per 2 Lots)</td><td>${plStr}</td></tr>`;
  html += '</table></div>';

  html += '<div class="section"><div class="section-title">STRATEGY & RATIONALE</div>';
  html += `<p><strong>Strategy:</strong> ${sanitize(content.strategy || 'Technical Analysis')}</p>`;
  html += `<p>${sanitize(content.rationale || 'Based on technical chart patterns and market momentum.')}</p></div>`;

  if (charts.length > 0) {
    html += '<div class="section"><div class="section-title">CHART SCREENSHOTS</div>';
    for (const chart of charts) {
      html += `<p><strong>Timeframe: ${tfLabels[chart.timeframe] || chart.timeframe}</strong></p>`;
      if (chart.base64) {
        html += `<img class="chart-img" src="data:${chart.mime};base64,${chart.base64}" />`;
      } else {
        html += '<p>[Chart image not available]</p>';
      }
    }
    html += '</div>';
  }

  html += '<div class="disclaimer"><strong>DISCLAIMER</strong><br>';
  html += sanitize(settings?.disclaimer_text || 'Investments in the securities market are subject to market risks. Read all the related documents carefully before investing.');
  html += '</div>';

  html += '<div class="signature"><div class="section-title">DIGITAL SIGNATURE</div>';
  html += `<p>Digitally Signed by: ${sanitize(settings?.analyst_name || 'Research Analyst')}</p>`;
  html += `<p>SEBI Registration: ${sanitize(settings?.sebi_reg_number || 'N/A')}</p>`;
  html += `<p>Date: ${ist.date}</p><p>Time: ${ist.time} IST</p>`;
  if (settings?.signature_image_path) {
    const sigPath = path.join(__dirname, '..', settings.signature_image_path);
    if (fs.existsSync(sigPath)) {
      const sigData = fs.readFileSync(sigPath).toString('base64');
      const ext = path.extname(sigPath).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
      html += `<img src="data:${mime};base64,${sigData}" style="max-width:150px;margin-top:10px" />`;
    }
  }
  html += '</div></body></html>';
  return html;
}

function buildWordHTML(report, settings, content, ist, charts) {
  const stockName = `${content.stockName || ''} ${content.strikePrice || ''} ${content.optionType || ''}`;
  const pl = content.profitLoss;
  const plStr = pl !== null && pl !== undefined ? (pl >= 0 ? '+' : '') + Number(pl).toFixed(2) + '/-' : 'N/A';

  let html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">';
  html += '<head><meta charset="utf-8"><title>Rationale Report</title>';
  html += '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->';
  html += '<style>body{font-family:Arial;margin:40px;color:#333}h1{text-align:center;color:#1a1a2e}';
  html += 'table{width:100%;border-collapse:collapse;margin:15px 0}td{padding:8px;border:1px solid #ddd}';
  html += '.label{font-weight:bold;background:#f5f5f5;width:200px}.section{margin:20px 0}';
  html += '.section-title{font-size:16px;font-weight:bold;color:#1a1a2e;border-bottom:1px solid #ccc;padding-bottom:5px;margin-bottom:10px}';
  html += '.disclaimer{font-size:11px;color:#666;margin-top:30px;padding:15px;border:1px solid #ddd;background:#fafafa}';
  html += '.signature{margin-top:30px;padding:15px;border-top:2px solid #333}';
  html += '.chart-img{max-width:450px;margin:10px 0}</style></head><body>';

  html += '<div style="text-align:center;border-bottom:2px solid #333;padding-bottom:15px;margin-bottom:20px"><h1>RATIONALE REPORT</h1>';
  if (settings?.company_name) html += `<p style="font-size:18px">${sanitize(settings.company_name)}</p>`;
  html += `<p>Date: ${sanitize(report.trade_date)}</p></div>`;

  html += '<div class="section"><div class="section-title">ANALYST DETAILS</div>';
  html += `<table><tr><td class="label">Name</td><td>${sanitize(settings?.analyst_name || 'N/A')}</td></tr>`;
  html += `<tr><td class="label">SEBI Registration</td><td>${sanitize(settings?.sebi_reg_number || 'N/A')}</td></tr>`;
  html += `<tr><td class="label">Company</td><td>${sanitize(settings?.company_name || 'N/A')}</td></tr>`;
  if (settings?.website_url) html += `<tr><td class="label">Website</td><td>${sanitize(settings.website_url)}</td></tr>`;
  html += '</table></div>';

  html += '<div class="section"><div class="section-title">TRADE DETAILS</div><table>';
  html += `<tr><td class="label">Stock</td><td>${sanitize(stockName)}</td></tr>`;
  html += `<tr><td class="label">Segment</td><td>${sanitize(content.segment || 'N/A')}</td></tr>`;
  html += `<tr><td class="label">Trade Type</td><td>${sanitize(content.tradeType || 'N/A')}</td></tr>`;
  html += `<tr><td class="label">Entry Price</td><td>${sanitize(content.entryPrice || 'N/A')}</td></tr>`;
  html += `<tr><td class="label">Exit Price</td><td>${sanitize(content.exitPrice || 'N/A')}</td></tr>`;
  html += `<tr><td class="label">Lot Size</td><td>${sanitize(content.lotSize || 'N/A')}</td></tr>`;
  html += `<tr><td class="label">P/L (Per 2 Lots)</td><td>${plStr}</td></tr>`;
  html += '</table></div>';

  html += '<div class="section"><div class="section-title">STRATEGY & RATIONALE</div>';
  html += `<p><strong>Strategy:</strong> ${sanitize(content.strategy || 'Technical Analysis')}</p>`;
  html += `<p>${sanitize(content.rationale || 'Based on technical chart patterns and market momentum.')}</p></div>`;

  if (charts.length > 0) {
    html += '<div class="section"><div class="section-title">CHART SCREENSHOTS</div>';
    for (const chart of charts) {
      html += `<p><strong>Timeframe: ${tfLabels[chart.timeframe] || chart.timeframe}</strong></p>`;
      if (chart.base64) {
        html += `<img class="chart-img" src="data:${chart.mime};base64,${chart.base64}" />`;
      } else {
        html += '<p>[Chart image not available]</p>';
      }
    }
    html += '</div>';
  }

  html += '<div class="disclaimer"><strong>DISCLAIMER</strong><br>';
  html += sanitize(settings?.disclaimer_text || 'Investments in the securities market are subject to market risks. Read all the related documents carefully before investing.');
  html += '</div>';

  html += '<div class="signature"><div class="section-title">DIGITAL SIGNATURE</div>';
  html += `<p>Digitally Signed by: ${sanitize(settings?.analyst_name || 'Research Analyst')}</p>`;
  html += `<p>SEBI Registration: ${sanitize(settings?.sebi_reg_number || 'N/A')}</p>`;
  html += `<p>Date: ${ist.date}</p><p>Time: ${ist.time} IST</p>`;
  if (settings?.signature_image_path) {
    const sigPath = path.join(__dirname, '..', settings.signature_image_path);
    if (fs.existsSync(sigPath)) {
      const sigData = fs.readFileSync(sigPath).toString('base64');
      const ext = path.extname(sigPath).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
      html += `<img src="data:${mime};base64,${sigData}" style="max-width:150px;margin-top:10px" />`;
    }
  }
  html += '</div></body></html>';
  return html;
}

router.get('/:id/download-pdf', async (req, res) => {
  try {
    const clientId = getClientId(req);
    if (!isOwner(req)) {
      const consent = req.session.report_consent_ids?.[req.params.id];
      if (!consent || (Math.floor(Date.now() / 1000) - consent.ts > 300)) {
        return res.status(403).json({ message: 'Consent required before downloading. Please accept the disclaimer first.' });
      }
    }
    const data = await getReportData(req.params.id, clientId);
    if (!data) return res.status(404).json({ message: 'Report not found' });
    if (data.denied) return res.status(403).json({ message: 'Access denied' });

    const ist = getISTDateTime();
    const html = buildPdfHTML(data.report, data.settings, data.content, ist, data.charts);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.get('/:id/download-word', async (req, res) => {
  try {
    const clientId = getClientId(req);
    if (!isOwner(req)) {
      const consent = req.session.report_consent_ids?.[req.params.id];
      if (!consent || (Math.floor(Date.now() / 1000) - consent.ts > 300)) {
        return res.status(403).json({ message: 'Consent required before downloading. Please accept the disclaimer first.' });
      }
    }
    const data = await getReportData(req.params.id, clientId);
    if (!data) return res.status(404).json({ message: 'Report not found' });
    if (data.denied) return res.status(403).json({ message: 'Access denied' });

    const ist = getISTDateTime();
    const html = buildWordHTML(data.report, data.settings, data.content, ist, data.charts);
    const stockName = `${data.content.stockName || ''} ${data.content.strikePrice || ''} ${data.content.optionType || ''}`.trim().replace(/\s+/g, '_');
    const filename = `Rationale_Report_${stockName}_${data.report.trade_date}.doc`;
    res.setHeader('Content-Type', 'application/msword');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(html);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.get('/', async (req, res) => {
  try {
    const clientId = getClientId(req);
    const date = req.query.date || null;
    let sql = 'SELECT * FROM reports WHERE 1=1';
    const params = [];
    if (date) { sql += ' AND trade_date = ?'; params.push(date); }
    if (clientId) { sql += ' AND client_id = ?'; params.push(clientId); }
    sql += ' ORDER BY created_at DESC';
    const reports = await query(sql, params);
    for (const r of reports) {
      r.content = JSON.parse(r.content || '{}');
      r.isGenerated = !!r.is_generated;
    }
    res.json(reports);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.post('/generate', async (req, res) => {
  try {
    const clientId = getClientId(req);
    const date = req.body.date || new Date().toISOString().slice(0, 10);
    let sql = 'SELECT * FROM trades WHERE trade_date = ? AND is_excluded = 0';
    const params = [date];
    if (clientId) { sql += ' AND client_id = ?'; params.push(clientId); }
    const trades = await query(sql, params);

    const generated = [];
    for (const trade of trades) {
      const charts = JSON.parse(trade.chart_screenshots || '[]');
      const reportId = generateUUID();
      const contentData = JSON.stringify({
        stockName: trade.stock_name, optionType: trade.option_type, strikePrice: trade.strike_price,
        entryPrice: trade.entry_price, exitPrice: trade.exit_price, profitLoss: trade.profit_loss_amount,
        lotSize: trade.lot_size, segment: trade.segment, tradeType: trade.trade_type,
        strategy: trade.strategy || 'Technical Analysis',
        rationale: trade.rationale || 'Based on technical chart patterns and market momentum.',
        chartScreenshots: charts,
      });
      await query(
        "INSERT INTO reports (id, client_id, trade_id, trade_date, report_type, content, pdf_path, is_generated) VALUES (?, ?, ?, ?, 'rationale', ?, 'generated', 1)",
        [reportId, clientId || trade.client_id, trade.id, date, contentData]
      );
      generated.push({ id: reportId, tradeId: trade.id, tradeDate: date, isGenerated: true, content: JSON.parse(contentData) });
    }
    res.json(generated);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.post('/:id/cleanup', async (req, res) => {
  try {
    const clientId = getClientId(req);
    const report = await queryOne('SELECT * FROM reports WHERE id = ?', [req.params.id]);
    if (!report) return res.status(404).json({ message: 'Report not found' });
    if (clientId && report.client_id !== clientId) return res.status(403).json({ message: 'Access denied' });

    const content = JSON.parse(report.content || '{}');
    const charts = content.chartScreenshots || [];
    const uploadsDir = path.resolve(__dirname, '..', 'uploads');
    for (const chart of charts) {
      const chartPath = path.resolve(__dirname, '..', chart.path);
      if (chartPath.startsWith(uploadsDir) && fs.existsSync(chartPath)) {
        fs.unlinkSync(chartPath);
      }
    }
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
