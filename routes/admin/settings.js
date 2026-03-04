const express = require('express');
const router = express.Router();
const { query, queryOne } = require('../../config/database');
const { generateUUID } = require('../../utils/helpers');
const { requireOwnerAuth } = require('../../middleware/auth');

router.use(requireOwnerAuth);

router.get('/', async (req, res) => {
  try {
    const settings = await queryOne('SELECT * FROM owner_settings LIMIT 1');
    if (!settings) {
      return res.json({
        gstEnabled: false, gstNumber: '', businessName: '', ownerEmail: '', ownerPhone: '',
        webhookEnabled: false, webhookProvider: 'razorpay', webhookSecret: '',
        razorpayKeyId: '', razorpayKeySecret: '',
      });
    }
    settings.webhookEnabled = !!settings.webhook_enabled;
    settings.webhookProvider = settings.webhook_provider || 'razorpay';
    settings.webhookSecret = settings.webhook_secret || '';
    settings.razorpayKeyId = settings.razorpay_key_id || '';
    settings.razorpayKeySecret = settings.razorpay_key_secret || '';
    res.json(settings);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.post('/', async (req, res) => {
  try {
    const d = req.body;
    const existing = await queryOne('SELECT * FROM owner_settings LIMIT 1');

    if (existing) {
      const sets = [];
      const params = [];
      if (d.gstEnabled !== undefined) { sets.push('gst_enabled = ?'); params.push(d.gstEnabled ? 1 : 0); }
      if (d.gstNumber !== undefined) { sets.push('gst_number = ?'); params.push(d.gstNumber); }
      if (d.businessName !== undefined) { sets.push('business_name = ?'); params.push(d.businessName); }
      if (d.ownerEmail !== undefined) { sets.push('owner_email = ?'); params.push(d.ownerEmail); }
      if (d.ownerPhone !== undefined) { sets.push('owner_phone = ?'); params.push(d.ownerPhone); }
      if (d.webhookEnabled !== undefined) { sets.push('webhook_enabled = ?'); params.push(d.webhookEnabled ? 1 : 0); }
      if (d.webhookProvider !== undefined) { sets.push('webhook_provider = ?'); params.push(d.webhookProvider); }
      if (d.webhookSecret !== undefined) { sets.push('webhook_secret = ?'); params.push(d.webhookSecret); }
      if (d.razorpayKeyId !== undefined) { sets.push('razorpay_key_id = ?'); params.push(d.razorpayKeyId); }
      if (d.razorpayKeySecret !== undefined) { sets.push('razorpay_key_secret = ?'); params.push(d.razorpayKeySecret); }

      if (sets.length > 0) {
        params.push(existing.id);
        await query('UPDATE owner_settings SET ' + sets.join(', ') + ' WHERE id = ?', params);
      }
    } else {
      const id = generateUUID();
      await query(
        'INSERT INTO owner_settings (id, gst_enabled, gst_number, business_name, owner_email, owner_phone, webhook_enabled, webhook_provider, webhook_secret, razorpay_key_id, razorpay_key_secret) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, d.gstEnabled ? 1 : 0, d.gstNumber || '', d.businessName || '', d.ownerEmail || '', d.ownerPhone || '',
         d.webhookEnabled ? 1 : 0, d.webhookProvider || 'razorpay', d.webhookSecret || '', d.razorpayKeyId || '', d.razorpayKeySecret || '']
      );
    }

    const result = await queryOne('SELECT * FROM owner_settings LIMIT 1');
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
