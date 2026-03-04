const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { query, queryOne } = require('../config/database');
const { getActiveSubscription } = require('../middleware/auth');

async function findClientByEmail(email) {
  return await queryOne('SELECT * FROM clients WHERE email = ? LIMIT 1', [email]);
}

async function findPlanById(planId) {
  return await queryOne('SELECT * FROM subscription_plans WHERE id = ? LIMIT 1', [planId]);
}

async function getActiveSubForClient(clientId) {
  const today = new Date().toISOString().slice(0, 10);
  return await queryOne(
    "SELECT * FROM subscriptions WHERE client_id = ? AND payment_status = 'confirmed' AND start_date <= ? AND end_date >= ? ORDER BY end_date DESC LIMIT 1",
    [clientId, today, today]
  );
}

async function createWebhookSubscription(client, plan, ownerSettings, amount, provider, paymentId) {
  const gstEnabled = !!ownerSettings.gst_enabled;
  const gstAmount = gstEnabled ? (plan.price * plan.gst_percent) / 100 : 0;
  const totalAmount = plan.price + gstAmount;

  const existingSub = await getActiveSubForClient(client.id);
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

  const id = crypto.randomBytes(16).toString('hex');
  await query(
    "INSERT INTO subscriptions (id, client_id, plan_id, start_date, end_date, amount_paid, gst_amount, total_amount, payment_status, payment_note, confirmed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, NOW(), NOW())",
    [id, client.id, plan.id, startDate, endDate, amount || plan.price, gstAmount, amount || totalAmount, `Auto-confirmed via ${provider} webhook. Payment ID: ${paymentId}`]
  );
  return true;
}

router.post('/', async (req, res) => {
  try {
    const ownerSettings = await queryOne('SELECT * FROM owner_settings LIMIT 1');
    if (!ownerSettings || !ownerSettings.webhook_enabled) return res.status(404).json({ message: 'Webhook not enabled' });

    const provider = ownerSettings.webhook_provider || 'razorpay';
    const rawBody = JSON.stringify(req.body);
    const body = req.body;

    if (provider === 'razorpay') {
      const webhookSecret = ownerSettings.webhook_secret || '';
      if (webhookSecret) {
        const signature = req.headers['x-razorpay-signature'] || '';
        if (!signature) return res.status(400).json({ message: 'Missing signature' });
        const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
        if (signature !== expected) return res.status(400).json({ message: 'Invalid signature' });
      }

      const event = body.event || '';
      const payload = body.payload || {};
      if (event === 'payment.captured' || event === 'order.paid') {
        const payment = payload.payment?.entity || payload.order?.entity || {};
        const email = payment.email || payment.notes?.email || '';
        const planId = payment.notes?.plan_id || '';
        const amount = (payment.amount || 0) / 100;

        if (email && planId) {
          const client = await findClientByEmail(email);
          const plan = await findPlanById(planId);
          if (client && plan) {
            await createWebhookSubscription(client, plan, ownerSettings, amount, 'Razorpay', payment.id || 'N/A');
            return res.json({ status: 'ok', message: 'Subscription activated' });
          }
        }
        return res.json({ status: 'ok', message: 'Payment received but could not match client/plan' });
      }
      return res.json({ status: 'ok', message: 'Event ignored' });
    }

    if (provider === 'stripe') {
      const stripeSecret = ownerSettings.webhook_secret || '';
      if (stripeSecret) {
        const stripeSig = req.headers['stripe-signature'] || '';
        if (!stripeSig) return res.status(400).json({ message: 'Missing Stripe signature' });
        const sigParts = {};
        stripeSig.split(',').forEach(part => {
          const [k, v] = part.split('=', 2);
          if (k && v) sigParts[k] = v;
        });
        const timestamp = sigParts.t || '';
        const v1Sig = sigParts.v1 || '';
        if (timestamp && v1Sig) {
          const expected = crypto.createHmac('sha256', stripeSecret).update(`${timestamp}.${rawBody}`).digest('hex');
          if (v1Sig !== expected) return res.status(400).json({ message: 'Invalid Stripe signature' });
        }
      }

      const event = body.type || '';
      const data = body.data?.object || {};
      if (event === 'checkout.session.completed' || event === 'payment_intent.succeeded') {
        const email = data.customer_email || data.metadata?.email || '';
        const planId = data.metadata?.plan_id || '';
        const amount = (data.amount_total || data.amount || 0) / 100;

        if (email && planId) {
          const client = await findClientByEmail(email);
          const plan = await findPlanById(planId);
          if (client && plan) {
            await createWebhookSubscription(client, plan, ownerSettings, amount, 'Stripe', data.id || 'N/A');
            return res.json({ status: 'ok', message: 'Subscription activated' });
          }
        }
        return res.json({ status: 'ok', message: 'Payment received but could not match client/plan' });
      }
      return res.json({ status: 'ok', message: 'Event ignored' });
    }

    res.json({ status: 'ok', message: 'Unknown provider' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
