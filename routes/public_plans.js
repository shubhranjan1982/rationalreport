const express = require('express');
const router = express.Router();
const { query, queryOne } = require('../config/database');

router.get('/', async (req, res) => {
  try {
    const plans = await query('SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY duration_months ASC');
    const ownerSettings = await queryOne('SELECT * FROM owner_settings LIMIT 1');
    const gstEnabled = ownerSettings && ownerSettings.gst_enabled;

    for (const plan of plans) {
      const gstAmount = gstEnabled ? (plan.price * plan.gst_percent / 100) : 0;
      plan.gstEnabled = !!gstEnabled;
      plan.gstAmount = gstAmount;
      plan.totalPrice = plan.price + gstAmount;
    }
    res.json({ plans });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
