const express = require('express');
const router = express.Router();
const { query, queryOne } = require('../../config/database');
const { generateUUID } = require('../../utils/helpers');
const { requireOwnerAuth } = require('../../middleware/auth');

router.use(requireOwnerAuth);

router.get('/', async (req, res) => {
  try {
    const plans = await query('SELECT * FROM subscription_plans ORDER BY created_at DESC');
    res.json(plans);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.post('/', async (req, res) => {
  try {
    const d = req.body;
    const id = generateUUID();
    await query(
      'INSERT INTO subscription_plans (id, name, duration_months, price, gst_percent, is_active) VALUES (?, ?, ?, ?, ?, ?)',
      [id, d.name || '', d.durationMonths || 1, d.price || 0, d.gstPercent || 18, d.isActive !== false ? 1 : 0]
    );
    const plan = await queryOne('SELECT * FROM subscription_plans WHERE id = ?', [id]);
    res.json(plan);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const d = req.body;
    const sets = [];
    const params = [];
    if (d.name !== undefined) { sets.push('name = ?'); params.push(d.name); }
    if (d.durationMonths !== undefined) { sets.push('duration_months = ?'); params.push(d.durationMonths); }
    if (d.price !== undefined) { sets.push('price = ?'); params.push(d.price); }
    if (d.gstPercent !== undefined) { sets.push('gst_percent = ?'); params.push(d.gstPercent); }
    if (d.isActive !== undefined) { sets.push('is_active = ?'); params.push(d.isActive ? 1 : 0); }

    if (sets.length > 0) {
      params.push(req.params.id);
      await query('UPDATE subscription_plans SET ' + sets.join(', ') + ' WHERE id = ?', params);
    }
    const plan = await queryOne('SELECT * FROM subscription_plans WHERE id = ?', [req.params.id]);
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    res.json(plan);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM subscription_plans WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
