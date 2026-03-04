const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { query, queryOne } = require('../config/database');
const { generateUUID } = require('../utils/helpers');
const { isOwner, isClient, getActiveSubscription } = require('../middleware/auth');

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

    let user = await queryOne('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      user = await queryOne('SELECT * FROM users WHERE username = ?', [email]);
    }
    if (user) {
      let valid = await bcrypt.compare(password, user.password);
      if (!valid && user.password === password) {
        valid = true;
        const hash = await bcrypt.hash(password, 10);
        await query('UPDATE users SET password = ? WHERE id = ?', [hash, user.id]);
      }
      if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

      req.session.user_id = user.id;
      req.session.role = 'owner';
      return res.json({ id: user.id, username: user.username, email: user.email, role: 'owner' });
    }

    const client = await queryOne('SELECT * FROM clients WHERE email = ?', [email]);
    if (!client) return res.status(401).json({ message: 'Invalid credentials' });
    if (!(await bcrypt.compare(password, client.password))) return res.status(401).json({ message: 'Invalid credentials' });
    if (!client.is_active) return res.status(403).json({ message: 'Account is deactivated. Contact the administrator.' });

    req.session.client_id = client.id;
    req.session.role = 'client';
    const activeSub = await getActiveSubscription(client.id);
    res.json({ id: client.id, name: client.name, email: client.email, role: 'client', hasActiveSubscription: !!activeSub, subscription: activeSub });
  } catch (err) { console.error('Login error:', err); res.status(500).json({ message: err.message || 'Server error' }); }
});

router.post('/owner-login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await queryOne('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    let valid = await bcrypt.compare(password, user.password);
    if (!valid && user.password === password) {
      valid = true;
      const hash = await bcrypt.hash(password, 10);
      await query('UPDATE users SET password = ? WHERE id = ?', [hash, user.id]);
    }
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

    req.session.user_id = user.id;
    req.session.role = 'owner';
    res.json({ id: user.id, username: user.username, email: user.email || '', role: 'owner' });
  } catch (err) { console.error('Owner login error:', err); res.status(500).json({ message: err.message || 'Server error' }); }
});

router.post('/client-register', async (req, res) => {
  try {
    const { name, email, phone, password, companyName, sebiRegNumber } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Name, email and password are required' });

    const existing = await queryOne('SELECT id FROM clients WHERE email = ?', [email]);
    if (existing) return res.status(400).json({ message: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const id = generateUUID();
    await query('INSERT INTO clients (id, name, email, phone, password, company_name, sebi_reg_number) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, name, email, phone || '', hash, companyName || '', sebiRegNumber || '']);

    req.session.client_id = id;
    req.session.role = 'client';
    res.json({ id, name, email, role: 'client' });
  } catch (err) { console.error('Register error:', err); res.status(500).json({ message: err.message || 'Server error' }); }
});

router.post('/client-login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const client = await queryOne('SELECT * FROM clients WHERE email = ?', [email]);
    if (!client) return res.status(401).json({ message: 'Invalid credentials' });
    if (!(await bcrypt.compare(password, client.password))) return res.status(401).json({ message: 'Invalid credentials' });
    if (!client.is_active) return res.status(403).json({ message: 'Account is deactivated. Contact the administrator.' });

    req.session.client_id = client.id;
    req.session.role = 'client';
    const activeSub = await getActiveSubscription(client.id);
    res.json({ id: client.id, name: client.name, email: client.email, role: 'client', hasActiveSubscription: !!activeSub, subscription: activeSub });
  } catch (err) { console.error('Client login error:', err); res.status(500).json({ message: err.message || 'Server error' }); }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

router.get('/me', async (req, res) => {
  try {
    if (isOwner(req) && req.session.user_id) {
      const user = await queryOne('SELECT * FROM users WHERE id = ?', [req.session.user_id]);
      if (!user) return res.status(401).json({ message: 'Not authenticated' });
      return res.json({ id: user.id, username: user.username, email: user.email || '', role: 'owner' });
    }
    if (isClient(req) && req.session.client_id) {
      const client = await queryOne('SELECT * FROM clients WHERE id = ?', [req.session.client_id]);
      if (!client) return res.status(401).json({ message: 'Not authenticated' });
      const activeSub = await getActiveSubscription(client.id);
      return res.json({ id: client.id, name: client.name, email: client.email, role: 'client', hasActiveSubscription: !!activeSub, subscription: activeSub });
    }
    res.status(401).json({ message: 'Not authenticated' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
