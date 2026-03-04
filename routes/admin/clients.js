const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { query, queryOne } = require('../../config/database');
const { requireOwnerAuth, getActiveSubscription } = require('../../middleware/auth');

router.use(requireOwnerAuth);

router.post('/:id/reset-password', async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });

    const client = await queryOne('SELECT * FROM clients WHERE id = ?', [req.params.id]);
    if (!client) return res.status(404).json({ message: 'Client not found' });

    const hash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE clients SET password = ? WHERE id = ?', [hash, req.params.id]);
    res.json({ success: true, message: `Password reset for ${client.name}` });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const client = await queryOne('SELECT * FROM clients WHERE id = ?', [req.params.id]);
    if (!client) return res.status(404).json({ message: 'Client not found' });

    await query('DELETE FROM subscriptions WHERE client_id = ?', [req.params.id]);
    await query('DELETE FROM trades WHERE client_id = ?', [req.params.id]);
    await query('DELETE FROM reports WHERE client_id = ?', [req.params.id]);
    await query('DELETE FROM analyst_settings WHERE client_id = ?', [req.params.id]);
    await query('DELETE FROM channel_groups WHERE client_id = ?', [req.params.id]);
    await query('DELETE FROM daily_summaries WHERE client_id = ?', [req.params.id]);
    await query('DELETE FROM report_consents WHERE client_id = ?', [req.params.id]);
    await query('DELETE FROM clients WHERE id = ?', [req.params.id]);

    res.json({ success: true, message: `Client ${client.name} removed` });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.get('/', async (req, res) => {
  try {
    const clients = await query('SELECT id, name, email, phone, company_name, sebi_reg_number, is_active, created_at FROM clients ORDER BY created_at DESC');
    for (const c of clients) {
      const sub = await getActiveSubscription(c.id);
      const countResult = await queryOne('SELECT COUNT(*) as cnt FROM subscriptions WHERE client_id = ?', [c.id]);
      c.hasActiveSubscription = !!sub;
      c.activeSubscription = sub;
      c.totalSubscriptions = countResult.cnt;
    }
    res.json(clients);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.get('/:id', async (req, res) => {
  try {
    const client = await queryOne('SELECT id, name, email, phone, company_name, sebi_reg_number, is_active, created_at FROM clients WHERE id = ?', [req.params.id]);
    if (!client) return res.status(404).json({ message: 'Client not found' });

    const subs = await query('SELECT * FROM subscriptions WHERE client_id = ? ORDER BY created_at DESC', [req.params.id]);
    client.subscriptions = subs;
    client.hasActiveSubscription = !!(await getActiveSubscription(req.params.id));
    client.activeSubscription = await getActiveSubscription(req.params.id);
    res.json(client);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const d = req.body;
    const sets = [];
    const params = [];
    if (d.isActive !== undefined) { sets.push('is_active = ?'); params.push(d.isActive ? 1 : 0); }
    if (d.name !== undefined) { sets.push('name = ?'); params.push(d.name); }
    if (d.phone !== undefined) { sets.push('phone = ?'); params.push(d.phone); }

    if (sets.length > 0) {
      params.push(req.params.id);
      await query('UPDATE clients SET ' + sets.join(', ') + ' WHERE id = ?', params);
    }
    const client = await queryOne('SELECT id, name, email, phone, company_name, sebi_reg_number, is_active FROM clients WHERE id = ?', [req.params.id]);
    res.json(client);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
