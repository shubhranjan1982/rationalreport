const { v4: uuidv4 } = require('uuid');

function generateUUID() {
  return uuidv4();
}

function sanitize(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function getISTDateTime() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = String(ist.getDate()).padStart(2, '0');
  const month = String(ist.getMonth() + 1).padStart(2, '0');
  const year = ist.getFullYear();
  let hours = ist.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const mins = String(ist.getMinutes()).padStart(2, '0');
  const secs = String(ist.getSeconds()).padStart(2, '0');

  return {
    date: `${day}/${month}/${year}`,
    time: `${String(hours).padStart(2, '0')}:${mins}:${secs} ${ampm}`,
    iso: `${year}-${month}-${day}`,
  };
}

function parseTelegramTradeMessage(text) {
  if (!text || text.trim().length < 10) return null;
  text = text.trim();

  const patterns = [
    /(?:BUY|SELL)\s+(\w+)\s+(\d+(?:\.\d+)?)\s*(CE|PE|CALL|PUT)?/i,
    /(\w+)\s+(\d+(?:\.\d+)?)\s*(CE|PE)\s+(?:@|AT|NEAR)\s*(\d+(?:\.\d+)?)/i,
    /(\w+)\s*(?:ABOVE|@|AT|NEAR)\s*(\d+(?:\.\d+)?)/i,
  ];

  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      let entry = null;
      const entryMatch = text.match(/(?:ENTRY|CMP|@|AT|NEAR|ABOVE)\s*:?\s*(\d+(?:\.\d+)?)/i);
      if (entryMatch) {
        entry = parseFloat(entryMatch[1]);
      } else if (matches[4]) {
        entry = parseFloat(matches[4]);
      } else if (matches[2] && !isNaN(matches[2])) {
        entry = parseFloat(matches[2]);
      }

      let sl = null;
      const slMatch = text.match(/(?:SL|STOP\s*LOSS)\s*:?\s*(\d+(?:\.\d+)?)/i);
      if (slMatch) sl = parseFloat(slMatch[1]);

      const targets = [];
      const tgtRegex = /(?:TGT|TARGET|T)\s*\d*\s*:?\s*(\d+(?:\.\d+)?)/gi;
      let tgtMatch;
      while ((tgtMatch = tgtRegex.exec(text)) !== null) {
        targets.push(tgtMatch[1]);
      }

      return {
        stockName: matches[1].toUpperCase(),
        strikePrice: matches[2] && !isNaN(matches[2]) ? parseFloat(matches[2]) : null,
        optionType: matches[3] || '',
        entryPrice: entry || 0,
        stopLoss: sl,
        targets,
        lotSize: 1,
        tradeType: 'INTRADAY',
        segment: 'STOCK OPTION',
      };
    }
  }
  return null;
}

module.exports = { generateUUID, sanitize, getISTDateTime, parseTelegramTradeMessage };
