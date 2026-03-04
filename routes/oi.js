const express = require('express');
const router = express.Router();
const kiteRouter = require('./kite');
const { requireActiveSubscription } = require('../middleware/auth');

router.use(requireActiveSubscription);

router.post('/fetch-kite', (req, res, next) => {
  req.url = '/fetch-oi';
  kiteRouter(req, res, next);
});

router.post('/paste', (req, res, next) => {
  req.url = '/paste-oi';
  kiteRouter(req, res, next);
});

router.post('/link-trade', (req, res, next) => {
  req.url = '/link-trade';
  kiteRouter(req, res, next);
});

router.get('/latest-snapshot', (req, res, next) => {
  req.url = '/latest-snapshot';
  kiteRouter(req, res, next);
});

module.exports = router;
