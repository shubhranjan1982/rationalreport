const express = require('express');
const router = express.Router();
const { query } = require('../../config/database');
const { requireOwnerAuth } = require('../../middleware/auth');

router.use(requireOwnerAuth);

router.get('/', async (req, res) => {
  try {
    const clients = await query('SELECT * FROM clients');
    const subs = await query('SELECT * FROM subscriptions ORDER BY created_at DESC');
    const today = new Date().toISOString().slice(0, 10);
    const currentMonth = today.slice(0, 7);
    const sevenDaysDate = new Date();
    sevenDaysDate.setDate(sevenDaysDate.getDate() + 7);
    const sevenDays = sevenDaysDate.toISOString().slice(0, 10);

    function toDateStr(d) {
      if (!d) return '';
      if (d instanceof Date) return d.toISOString().slice(0, 10);
      return String(d).slice(0, 10);
    }

    let activeCount = 0, pendingPayments = 0, totalRevenue = 0, revenueThisMonth = 0;
    const expiringSoon = [];

    for (const sub of subs) {
      const sd = toDateStr(sub.start_date);
      const ed = toDateStr(sub.end_date);
      if (sub.payment_status === 'confirmed' && sd <= today && ed >= today) activeCount++;
      if (sub.payment_status === 'pending') pendingPayments++;
      if (sub.payment_status === 'confirmed') {
        totalRevenue += parseFloat(sub.total_amount || 0);
        if (sd.slice(0, 7) === currentMonth) {
          revenueThisMonth += parseFloat(sub.total_amount || 0);
        }
      }
      if (sub.payment_status === 'confirmed' && ed >= today && ed <= sevenDays) {
        const client = clients.find(c => c.id === sub.client_id);
        expiringSoon.push({ ...sub, clientName: client?.name || 'Unknown', clientEmail: client?.email || '' });
      }
    }

    const recentSubs = subs.slice(0, 10).map(sub => {
      const client = clients.find(c => c.id === sub.client_id);
      return { ...sub, clientName: client?.name || 'Unknown', clientEmail: client?.email || '' };
    });

    res.json({ totalClients: clients.length, activeSubscriptions: activeCount, pendingPayments, totalRevenue, revenueThisMonth, expiringSoon, recentSubscriptions: recentSubs });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
