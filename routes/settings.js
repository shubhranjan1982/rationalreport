const express = require('express');
const router = express.Router();
const { query, queryOne } = require('../config/database');
const { generateUUID } = require('../utils/helpers');
const { requireActiveSubscription, getClientId } = require('../middleware/auth');

router.use(requireActiveSubscription);

router.get('/', async (req, res) => {
  try {
    const clientId = getClientId(req);
    let settings = null;
    if (clientId) {
      settings = await queryOne('SELECT * FROM analyst_settings WHERE client_id = ? LIMIT 1', [clientId]);
    }
    if (!settings) {
      settings = await queryOne('SELECT * FROM analyst_settings LIMIT 1');
    }
    if (!settings) {
      return res.json({
        analystName: '', sebiRegNumber: '', companyName: '', websiteUrl: '',
        telegramBotToken: '', paidChannelId: '', freeChannelId: '',
        automationTime: '16:00', disclaimerText: '', isActive: false,
      });
    }
    res.json(settings);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.post('/', async (req, res) => {
  try {
    const clientId = getClientId(req);
    const data = req.body;

    let existing = null;
    if (clientId) {
      existing = await queryOne('SELECT * FROM analyst_settings WHERE client_id = ? LIMIT 1', [clientId]);
    }
    if (!existing) {
      existing = await queryOne('SELECT * FROM analyst_settings LIMIT 1');
    }

    const fieldMap = {
      analystName: 'analyst_name', sebiRegNumber: 'sebi_reg_number',
      companyName: 'company_name', websiteUrl: 'website_url',
      telegramBotToken: 'telegram_bot_token', paidChannelId: 'paid_channel_id',
      freeChannelId: 'free_channel_id', automationTime: 'automation_time',
      disclaimerText: 'disclaimer_text', signatureImagePath: 'signature_image_path',
      logoImagePath: 'logo_image_path',
      kiteApiKey: 'kite_api_key', kiteApiSecret: 'kite_api_secret',
      aiProvider: 'ai_provider', aiApiKey: 'ai_api_key',
      privateRelayChannelId: 'private_relay_channel_id',
    };

    if (existing) {
      const sets = [];
      const params = [];
      for (const [js, db] of Object.entries(fieldMap)) {
        if (data[js] !== undefined) { sets.push(`${db} = ?`); params.push(data[js]); }
      }
      if (data.isActive !== undefined) { sets.push('is_active = ?'); params.push(data.isActive ? 1 : 0); }
      if (sets.length > 0) {
        params.push(existing.id);
        await query('UPDATE analyst_settings SET ' + sets.join(', ') + ' WHERE id = ?', params);
      }
    } else {
      const sId = generateUUID();
      await query(
        'INSERT INTO analyst_settings (id, client_id, analyst_name, sebi_reg_number, company_name, website_url, telegram_bot_token, paid_channel_id, free_channel_id, automation_time, disclaimer_text, private_relay_channel_id, kite_api_key, kite_api_secret, ai_provider, ai_api_key, signature_image_path, logo_image_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [sId, clientId, data.analystName || '', data.sebiRegNumber || '', data.companyName || '',
         data.websiteUrl || '', data.telegramBotToken || '', data.paidChannelId || '',
         data.freeChannelId || '', data.automationTime || '16:00', data.disclaimerText || '',
         data.privateRelayChannelId || '', data.kiteApiKey || '', data.kiteApiSecret || '',
         data.aiProvider || 'gemini', data.aiApiKey || '', data.signatureImagePath || '', data.logoImagePath || '']
      );
    }

    let result;
    if (clientId) {
      result = await queryOne('SELECT * FROM analyst_settings WHERE client_id = ? LIMIT 1', [clientId]);
    }
    if (!result) {
      result = await queryOne('SELECT * FROM analyst_settings LIMIT 1');
    }
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
