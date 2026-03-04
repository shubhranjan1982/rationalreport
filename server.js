require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const cors = require('cors');
const path = require('path');
const { pool } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const sessionStoreOptions = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'tradebot_pro',
  clearExpired: true,
  checkExpirationInterval: 900000,
  expiration: 86400000,
  createDatabaseTable: true,
};

const sessionStore = new MySQLStore(sessionStoreOptions);
app.use(session({
  key: 'tradebot_session',
  secret: process.env.SESSION_SECRET || 'tradebot-secret-key',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' },
}));

app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/api/health', async (req, res) => {
  try {
    const { query: dbQuery } = require('./config/database');
    await dbQuery('SELECT 1');
    const tables = await dbQuery('SHOW TABLES');
    const users = await dbQuery('SELECT id, username, email FROM users LIMIT 5');
    res.json({ status: 'ok', database: 'connected', tables: tables.length, users });
  } catch (err) {
    res.status(500).json({ status: 'error', database: 'failed', error: err.message, code: err.code });
  }
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/trades', require('./routes/trades'));
app.use('/api/reports', require('./routes/reports'));

const reportsRouter = require('./routes/reports');
app.post('/api/report-consent', (req, res, next) => {
  req.url = '/consent';
  reportsRouter(req, res, next);
});
app.use('/api/channel-groups', require('./routes/channel_groups'));
app.use('/api/channel_groups', require('./routes/channel_groups'));
app.use('/api/telegram', require('./routes/telegram'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/kite', require('./routes/kite'));
app.use('/api/oi', require('./routes/oi'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/screener', require('./routes/screener'));
app.use('/api/webhook', require('./routes/webhook'));
app.use('/api/public/plans', require('./routes/public_plans'));
app.use('/api/client/subscription', require('./routes/client_subscription'));
app.use('/api/admin/plans', require('./routes/admin/plans'));
app.use('/api/admin/clients', require('./routes/admin/clients'));
app.use('/api/admin/subscriptions', require('./routes/admin/subscriptions'));
app.use('/api/admin/dashboard', require('./routes/admin/dashboard'));
app.use('/api/admin/settings', require('./routes/admin/settings'));
app.use('/api/admin/owner-settings', require('./routes/admin/settings'));
app.use('/api/admin/consents', require('./routes/admin/consents'));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ message: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`TradeBot Pro running on port ${PORT}`);
  console.log(`Database: ${process.env.DB_NAME || 'tradebot_pro'} @ ${process.env.DB_HOST || 'localhost'}`);
});
