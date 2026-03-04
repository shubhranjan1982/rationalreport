const express = require('express');
const router = express.Router();
const { query, queryOne } = require('../config/database');
const { generateUUID } = require('../utils/helpers');
const { requireActiveSubscription, getClientId } = require('../middleware/auth');

router.use(requireActiveSubscription);

router.get('/', async (req, res) => {
  try {
    const clientId = getClientId(req);
    let sql = 'SELECT * FROM channel_groups WHERE 1=1';
    const params = [];
    if (clientId) { sql += ' AND client_id = ?'; params.push(clientId); }
    sql += ' ORDER BY created_at DESC';
    const groups = await query(sql, params);
    for (const g of groups) { g.isActive = !!g.is_active; }
    res.json(groups);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.post('/', async (req, res) => {
  try {
    const clientId = getClientId(req);
    const d = req.body;
    const gId = generateUUID();
    await query(
      'INSERT INTO channel_groups (id, client_id, name, segment, paid_channel_id, free_channel_id, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [gId, clientId || d.clientId || null, d.name || '', d.segment || 'STOCK OPTION', d.paidChannelId || '', d.freeChannelId || '', d.isActive !== false ? 1 : 0]
    );
    const group = await queryOne('SELECT * FROM channel_groups WHERE id = ?', [gId]);
    res.json(group);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const clientId = getClientId(req);
    const group = await queryOne('SELECT * FROM channel_groups WHERE id = ?', [req.params.id]);
    if (!group) return res.status(404).json({ message: 'Channel group not found' });
    if (clientId && group.client_id !== clientId) return res.status(403).json({ message: 'Access denied' });

    const d = req.body;
    const sets = [];
    const params = [];
    if (d.name !== undefined) { sets.push('name = ?'); params.push(d.name); }
    if (d.segment !== undefined) { sets.push('segment = ?'); params.push(d.segment); }
    if (d.paidChannelId !== undefined) { sets.push('paid_channel_id = ?'); params.push(d.paidChannelId); }
    if (d.freeChannelId !== undefined) { sets.push('free_channel_id = ?'); params.push(d.freeChannelId); }
    if (d.isActive !== undefined) { sets.push('is_active = ?'); params.push(d.isActive ? 1 : 0); }

    if (sets.length > 0) {
      params.push(req.params.id);
      await query('UPDATE channel_groups SET ' + sets.join(', ') + ' WHERE id = ?', params);
    }
    const updated = await queryOne('SELECT * FROM channel_groups WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const clientId = getClientId(req);
    const group = await queryOne('SELECT client_id FROM channel_groups WHERE id = ?', [req.params.id]);
    if (!group) return res.status(404).json({ message: 'Not found' });
    if (clientId && group.client_id !== clientId) return res.status(403).json({ message: 'Access denied' });
    await query('DELETE FROM channel_groups WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
