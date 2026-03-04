const express = require('express');
const router = express.Router();
const { query, queryOne } = require('../../config/database');
const { requireOwnerAuth } = require('../../middleware/auth');

router.use(requireOwnerAuth);

router.get('/export-csv', async (req, res) => {
  try {
    const consents = await query('SELECT * FROM report_consents ORDER BY created_at DESC');
    const headers = ['ID', 'Client Name', 'Client Email', 'Report ID', 'Report Title', 'Format', 'Consent Given', 'IP Address', 'Date & Time (IST)'];
    const rows = consents.map(c => {
      const dt = new Date(c.created_at);
      const istStr = dt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
      return [
        c.id,
        `"${(c.client_name || '').replace(/"/g, '""')}"`,
        c.client_email,
        c.report_id,
        `"${(c.report_title || '').replace(/"/g, '""')}"`,
        c.download_format,
        c.consent_given ? 'Yes' : 'No',
        c.ip_address,
        istStr,
      ].join(',');
    });

    const csv = headers.join(',') + '\n' + rows.join('\n') + '\n';
    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=consent_log_${today}.csv`);
    res.send(csv);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.delete('/before/:date', async (req, res) => {
  try {
    const result = await query('DELETE FROM report_consents WHERE created_at < ?', [req.params.date]);
    const count = result.affectedRows || 0;
    res.json({ success: true, deletedCount: count, message: `Deleted ${count} consent records before ${req.params.date}` });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.get('/by-client/:clientId', async (req, res) => {
  try {
    const consents = await query('SELECT * FROM report_consents WHERE client_id = ? ORDER BY created_at DESC', [req.params.clientId]);
    res.json(consents);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.get('/', async (req, res) => {
  try {
    const consents = await query('SELECT * FROM report_consents ORDER BY created_at DESC');
    res.json(consents);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
