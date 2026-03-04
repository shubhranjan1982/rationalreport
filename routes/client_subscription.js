const express = require('express');
const router = express.Router();
const { query, queryOne } = require('../config/database');
const { requireAuth, isClient, getActiveSubscription } = require('../middleware/auth');

router.get('/', requireAuth, async (req, res) => {
  try {
    if (!isClient(req)) return res.status(403).json({ message: 'Client access only' });
    const clientId = req.session.client_id;

    const activeSub = await getActiveSubscription(clientId);
    const subs = await query('SELECT * FROM subscriptions WHERE client_id = ? ORDER BY created_at DESC', [clientId]);

    let daysRemaining = null;
    let expiryWarning = false;
    if (activeSub) {
      const endVal = activeSub.end_date instanceof Date ? activeSub.end_date : new Date(activeSub.end_date);
      const endDate = new Date(endVal.getFullYear(), endVal.getMonth(), endVal.getDate());
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffTime = endDate.getTime() - today.getTime();
      daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      expiryWarning = daysRemaining <= 3 && daysRemaining >= 0;
    }

    res.json({ activeSubscription: activeSub, subscriptions: subs, daysRemaining, expiryWarning });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
