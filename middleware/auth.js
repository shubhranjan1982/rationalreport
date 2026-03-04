const { query, queryOne } = require('../config/database');

function isLoggedIn(req) {
  return !!(req.session && (req.session.user_id || req.session.client_id));
}

function isOwner(req) {
  return req.session && req.session.role === 'owner';
}

function isClient(req) {
  return req.session && req.session.role === 'client';
}

function getClientId(req) {
  if (isOwner(req)) return null;
  return (req.session && req.session.client_id) || null;
}

function requireAuth(req, res, next) {
  if (!isLoggedIn(req)) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  next();
}

function requireOwnerAuth(req, res, next) {
  if (!isLoggedIn(req)) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  if (!isOwner(req)) {
    return res.status(403).json({ message: 'Owner access required' });
  }
  next();
}

async function requireActiveSubscription(req, res, next) {
  if (!isLoggedIn(req)) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  if (isOwner(req)) return next();

  const clientId = getClientId(req);
  if (!clientId) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const client = await queryOne('SELECT is_active FROM clients WHERE id = ?', [clientId]);
  if (!client || !client.is_active) {
    return res.status(403).json({ message: 'Account is deactivated' });
  }

  const today = new Date().toISOString().slice(0, 10);
  const sub = await queryOne(
    "SELECT id FROM subscriptions WHERE client_id = ? AND payment_status = 'confirmed' AND start_date <= ? AND end_date >= ? LIMIT 1",
    [clientId, today, today]
  );
  if (!sub) {
    return res.status(403).json({ message: 'subscription_expired', subscriptionExpired: true });
  }
  next();
}

async function getActiveSubscription(clientId) {
  const today = new Date().toISOString().slice(0, 10);
  return await queryOne(
    "SELECT * FROM subscriptions WHERE client_id = ? AND payment_status = 'confirmed' AND start_date <= ? AND end_date >= ? ORDER BY end_date DESC LIMIT 1",
    [clientId, today, today]
  );
}

module.exports = {
  isLoggedIn, isOwner, isClient, getClientId,
  requireAuth, requireOwnerAuth, requireActiveSubscription,
  getActiveSubscription,
};
