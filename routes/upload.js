const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query, queryOne } = require('../config/database');
const { requireActiveSubscription, getClientId } = require('../middleware/auth');

router.use(requireActiveSubscription);

const chartStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'charts');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `chart-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}${ext}`);
  },
});
const uploadChart = multer({ storage: chartStorage });

const sigStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'signatures');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `signature-${Date.now()}${ext}`);
  },
});
const uploadSignature = multer({ storage: sigStorage });

router.post('/chart', uploadChart.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const clientId = getClientId(req);
    const tradeId = req.body.tradeId || '';
    const timeframe = req.body.timeframe || '5m';

    if (tradeId) {
      const trade = await queryOne('SELECT * FROM trades WHERE id = ?', [tradeId]);
      if (!trade) return res.status(404).json({ message: 'Trade not found' });
      if (clientId && trade.client_id !== clientId) return res.status(403).json({ message: 'Access denied' });

      const charts = JSON.parse(trade.chart_screenshots || '[]');
      const relativePath = `uploads/charts/${req.file.filename}`;
      charts.push({ timeframe, path: relativePath });
      await query('UPDATE trades SET chart_screenshots = ? WHERE id = ?', [JSON.stringify(charts), tradeId]);
      return res.json({ path: relativePath, timeframe });
    }

    const relativePath = `uploads/charts/${req.file.filename}`;
    res.json({ path: relativePath, timeframe });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.post('/signature', uploadSignature.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const relativePath = `uploads/signatures/${req.file.filename}`;
    res.json({ path: relativePath });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
