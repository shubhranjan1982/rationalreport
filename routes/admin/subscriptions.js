const express = require('express');
const router = express.Router();
const { query, queryOne } = require('../../config/database');
const { generateUUID } = require('../../utils/helpers');
const { requireOwnerAuth, getActiveSubscription } = require('../../middleware/auth');

router.use(requireOwnerAuth);

router.get('/', async (req, res) => {
  try {
    const subs = await query('SELECT * FROM subscriptions ORDER BY created_at DESC');
    res.json(subs);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.post('/', async (req, res) => {
  try {
    const { clientId, planId, paymentNote } = req.body;

    const plan = await queryOne('SELECT * FROM subscription_plans WHERE id = ?', [planId]);
    if (!plan) return res.status(404).json({ message: 'Plan not found' });

    const ownerSettings = await queryOne('SELECT * FROM owner_settings LIMIT 1');
    const gstEnabled = ownerSettings && ownerSettings.gst_enabled;

    const existingSub = await getActiveSubscription(clientId);
    let startDate;
    if (existingSub) {
      const endVal = existingSub.end_date instanceof Date ? existingSub.end_date : new Date(existingSub.end_date);
      const existingEnd = new Date(endVal.getFullYear(), endVal.getMonth(), endVal.getDate());
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (existingEnd >= today) {
        existingEnd.setDate(existingEnd.getDate() + 1);
        startDate = existingEnd.toISOString().slice(0, 10);
      } else {
        startDate = today.toISOString().slice(0, 10);
      }
    } else {
      startDate = new Date().toISOString().slice(0, 10);
    }

    const endDateObj = new Date(startDate);
    endDateObj.setMonth(endDateObj.getMonth() + plan.duration_months);
    const endDate = endDateObj.toISOString().slice(0, 10);

    const gstAmount = gstEnabled ? (plan.price * plan.gst_percent / 100) : 0;
    const totalAmount = plan.price + gstAmount;

    const subId = generateUUID();
    await query(
      "INSERT INTO subscriptions (id, client_id, plan_id, start_date, end_date, amount_paid, gst_amount, total_amount, payment_status, payment_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
      [subId, clientId, planId, startDate, endDate, plan.price, gstAmount, totalAmount, paymentNote || '']
    );

    const sub = await queryOne('SELECT * FROM subscriptions WHERE id = ?', [subId]);
    res.json(sub);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const d = req.body;
    const sets = [];
    const params = [];
    if (d.paymentStatus !== undefined) {
      sets.push('payment_status = ?');
      params.push(d.paymentStatus);
      if (d.paymentStatus === 'confirmed') sets.push('confirmed_at = NOW()');
    }
    if (d.paymentNote !== undefined) { sets.push('payment_note = ?'); params.push(d.paymentNote); }

    if (sets.length > 0) {
      params.push(req.params.id);
      await query('UPDATE subscriptions SET ' + sets.join(', ') + ' WHERE id = ?', params);
    }

    const sub = await queryOne('SELECT * FROM subscriptions WHERE id = ?', [req.params.id]);
    if (!sub) return res.status(404).json({ message: 'Subscription not found' });
    res.json(sub);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
