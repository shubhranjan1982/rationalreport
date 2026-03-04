const express = require('express');
const router = express.Router();
const { query, queryOne } = require('../config/database');
const { generateUUID } = require('../utils/helpers');
const { requireActiveSubscription, getClientId } = require('../middleware/auth');

router.use(requireActiveSubscription);

router.get('/data', async (req, res) => {
  try {
    const clientId = getClientId(req);
    let sql = 'SELECT * FROM oi_snapshots WHERE 1=1';
    const params = [];
    if (clientId) { sql += ' AND client_id = ?'; params.push(clientId); }
    sql += ' ORDER BY created_at DESC LIMIT 1';
    const snapshot = await queryOne(sql, params);
    if (!snapshot) return res.json({ data: [], count: 0, timestamp: null });

    const data = JSON.parse(snapshot.data);
    res.json({ data, count: data.length, timestamp: `${snapshot.snapshot_date} ${snapshot.snapshot_time}`, source: snapshot.data_source });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.get('/presets', async (req, res) => {
  try {
    const clientId = getClientId(req);
    let sql = 'SELECT * FROM screener_presets WHERE 1=1';
    const params = [];
    if (clientId) { sql += ' AND client_id = ?'; params.push(clientId); }
    sql += ' ORDER BY created_at DESC';
    const presets = await query(sql, params);
    for (const p of presets) { p.filters = JSON.parse(p.filters || '[]'); }
    res.json(presets);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.post('/presets', async (req, res) => {
  try {
    const clientId = getClientId(req);
    const d = req.body;
    const presetId = generateUUID();
    await query(
      'INSERT INTO screener_presets (id, client_id, name, filters, sort_field, sort_direction) VALUES (?, ?, ?, ?, ?, ?)',
      [presetId, clientId, d.name || 'Untitled', JSON.stringify(d.filters || []), d.sortField || '', d.sortDirection || 'desc']
    );
    const preset = await queryOne('SELECT * FROM screener_presets WHERE id = ?', [presetId]);
    preset.filters = JSON.parse(preset.filters || '[]');
    res.json(preset);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.delete('/presets/:id', async (req, res) => {
  try {
    const clientId = getClientId(req);
    const preset = await queryOne('SELECT client_id FROM screener_presets WHERE id = ?', [req.params.id]);
    if (!preset) return res.status(404).json({ message: 'Preset not found' });
    if (clientId && preset.client_id !== clientId) return res.status(403).json({ message: 'Access denied' });
    await query('DELETE FROM screener_presets WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
