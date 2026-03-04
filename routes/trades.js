const express = require('express');
const router = express.Router();
const { query, queryOne } = require('../config/database');
const { generateUUID } = require('../utils/helpers');
const { requireActiveSubscription, getClientId } = require('../middleware/auth');

router.use(requireActiveSubscription);

router.get('/', async (req, res) => {
  try {
    const clientId = getClientId(req);
    const date = req.query.date || null;
    let sql = 'SELECT * FROM trades WHERE 1=1';
    const params = [];
    if (date) { sql += ' AND trade_date = ?'; params.push(date); }
    if (clientId) { sql += ' AND client_id = ?'; params.push(clientId); }
    sql += ' ORDER BY created_at DESC';
    const trades = await query(sql, params);
    for (const t of trades) {
      t.chartScreenshots = JSON.parse(t.chart_screenshots || '[]');
      t.rawMessages = JSON.parse(t.raw_messages || '[]');
      t.targets = t.targets ? t.targets.split(',') : [];
      t.isReentry = !!t.is_reentry;
      t.isApproved = !!t.is_approved;
      t.isExcluded = !!t.is_excluded;
      t.isPosted = !!t.is_posted;
    }
    res.json(trades);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.get('/:id', async (req, res) => {
  try {
    const clientId = getClientId(req);
    const trade = await queryOne('SELECT * FROM trades WHERE id = ?', [req.params.id]);
    if (!trade) return res.status(404).json({ message: 'Trade not found' });
    if (clientId && trade.client_id !== clientId) return res.status(403).json({ message: 'Access denied' });
    trade.chartScreenshots = JSON.parse(trade.chart_screenshots || '[]');
    res.json(trade);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.post('/', async (req, res) => {
  try {
    const clientId = getClientId(req);
    const d = req.body;
    const id = generateUUID();
    const targets = Array.isArray(d.targets) ? d.targets.join(',') : (d.targets || null);
    await query(
      'INSERT INTO trades (id, client_id, trade_date, stock_name, option_type, strike_price, lot_size, entry_price, exit_price, stop_loss, targets, profit_loss, profit_loss_amount, status, trade_type, segment, is_approved, is_excluded, notes, rationale, strategy, channel_group_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, clientId || d.clientId || null, d.tradeDate || new Date().toISOString().slice(0, 10),
       d.stockName || '', d.optionType || '', d.strikePrice || null, d.lotSize || 1,
       d.entryPrice || 0, d.exitPrice || null, d.stopLoss || null, targets,
       d.profitLoss || null, d.profitLossAmount || null, d.status || 'active',
       d.tradeType || 'INTRADAY', d.segment || 'STOCK OPTION',
       d.isApproved ? 1 : 0, d.isExcluded ? 1 : 0,
       d.notes || null, d.rationale || null, d.strategy || null, d.channelGroupId || null]
    );
    const trade = await queryOne('SELECT * FROM trades WHERE id = ?', [id]);
    res.json(trade);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const clientId = getClientId(req);
    const trade = await queryOne('SELECT * FROM trades WHERE id = ?', [req.params.id]);
    if (!trade) return res.status(404).json({ message: 'Trade not found' });
    if (clientId && trade.client_id !== clientId) return res.status(403).json({ message: 'Access denied' });

    const d = req.body;
    const sets = [];
    const params = [];
    const fieldMap = {
      stockName: 'stock_name', optionType: 'option_type', strikePrice: 'strike_price',
      lotSize: 'lot_size', entryPrice: 'entry_price', exitPrice: 'exit_price',
      stopLoss: 'stop_loss', profitLoss: 'profit_loss', profitLossAmount: 'profit_loss_amount',
      status: 'status', tradeType: 'trade_type', segment: 'segment',
      notes: 'notes', rationale: 'rationale', strategy: 'strategy',
      highestTargetHit: 'highest_target_hit', channelGroupId: 'channel_group_id',
    };
    for (const [js, db] of Object.entries(fieldMap)) {
      if (d[js] !== undefined) { sets.push(`${db} = ?`); params.push(d[js]); }
    }
    const boolFields = { isApproved: 'is_approved', isExcluded: 'is_excluded', isPosted: 'is_posted', isReentry: 'is_reentry' };
    for (const [js, db] of Object.entries(boolFields)) {
      if (d[js] !== undefined) { sets.push(`${db} = ?`); params.push(d[js] ? 1 : 0); }
    }
    if (d.chartScreenshots !== undefined) { sets.push('chart_screenshots = ?'); params.push(JSON.stringify(d.chartScreenshots)); }
    if (d.targets !== undefined) { sets.push('targets = ?'); params.push(Array.isArray(d.targets) ? d.targets.join(',') : d.targets); }

    if (sets.length > 0) {
      params.push(req.params.id);
      await query('UPDATE trades SET ' + sets.join(', ') + ' WHERE id = ?', params);
    }
    const updated = await queryOne('SELECT * FROM trades WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const clientId = getClientId(req);
    const trade = await queryOne('SELECT client_id FROM trades WHERE id = ?', [req.params.id]);
    if (!trade) return res.status(404).json({ message: 'Trade not found' });
    if (clientId && trade.client_id !== clientId) return res.status(403).json({ message: 'Access denied' });
    await query('DELETE FROM trades WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
