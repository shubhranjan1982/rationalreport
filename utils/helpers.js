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
  try {
    if (!text || text.trim().length < 10) return null;
    text = text.trim();
    const upperText = text.toUpperCase();

    if (!upperText.includes('CE') && !upperText.includes('PE') && !upperText.includes('FUT')) {
      return null;
    }
    if (upperText.includes('DISCLAIMER') || upperText.includes('SEBI') || upperText.includes('NISM')) {
      return null;
    }

    const EXPIRY_MONTHS = /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|JANUARY|FEBRUARY|MARCH|APRIL|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)$/i;
    const stockPatterns = [
      /([A-Z][A-Z0-9&]+)\s+(?:(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|M,?AR)\s+)?(\d+)\s+(CE|PE)\s+(?:ABV|ABOVE|@|AT)\s+(\d+(?:\.\d+)?)/i,
      /([A-Z][A-Z0-9&]+)\s+(?:(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|M,?AR)\s+)?(\d+)\s+(CE|PE)\s+(\d+(?:\.\d+)?)/i,
      /BUY\s+([A-Z][A-Z0-9&]+)\s+(?:(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|M,?AR)\s+)?(\d+)\s+(CE|PE)\s+(?:@|AT)\s+(\d+(?:\.\d+)?)/i,
    ];

    for (const pattern of stockPatterns) {
      const match = text.match(pattern);
      if (match) {
        let stockName = match[1];
        if (EXPIRY_MONTHS.test(stockName)) {
          const priorMatch = text.match(new RegExp(`([A-Z][A-Z0-9&]+)\\s+${stockName}`, 'i'));
          if (priorMatch) stockName = priorMatch[1];
        }
        const strikePrice = parseFloat(match[2]);
        const optionType = match[3].toUpperCase();
        const entryPrice = parseFloat(match[4]);

        let stopLoss = null;
        const slMatch = text.match(/SL\s+(\d+(?:\.\d+)?)/i);
        if (slMatch) stopLoss = parseFloat(slMatch[1]);

        let targets = [];
        const tgtMatch = text.match(/TGT?\s+([\d\s,.\-+]+)/i);
        if (tgtMatch) {
          targets = tgtMatch[1].split(/[\s,\-+]+/).filter(t => t && !isNaN(parseFloat(t))).map(t => t.trim());
        }

        const segment = upperText.includes('INDEX') ? 'INDEX OPTION' : 'STOCK OPTION';
        const tradeType = upperText.includes('POSITIONAL') ? 'POSITIONAL' : 'INTRADAY';

        return {
          stockName,
          strikePrice,
          optionType,
          entryPrice,
          stopLoss,
          targets,
          segment,
          tradeType,
          lotSize: 1,
          status: 'active',
        };
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

module.exports = { generateUUID, sanitize, getISTDateTime, parseTelegramTradeMessage };
