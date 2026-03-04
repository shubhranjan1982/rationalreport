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
    const skipWords = ['DISCLAIMER', 'SEBI REGISTERED', 'NISM CERTIFIED', 'INVESTMENT ADVISER', 'NOT A RECOMMENDATION'];
    if (skipWords.some(w => upperText.includes(w))) {
      return null;
    }
    if (/BOOKED?\s+(?:AT|PROFIT)|EXIT\s+(?:AT|DONE|NEAR)|HIGH\s*MADE|PROFIT\s+BOOKED|TARGET\s*(HIT|DONE|ACHIEVED)|SL\s*HIT|STOP\s*LOSS\s*(HIT|TRIGGERED)/i.test(text) && !/BUY|ABV|ABOVE|@\s*\d|CMP\s*\d/i.test(text)) {
      return null;
    }

    const EXPIRY_MONTHS = /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)$/i;
    const MONTH_PAT = '(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|JANUARY|FEBRUARY|MARCH|APRIL|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|M,?AR)';
    const stockPatterns = [
      new RegExp(`#?([A-Z][A-Z0-9&]+)\\s+(?:${MONTH_PAT}\\s+)?(\\d+)\\s+(CE|PE)\\s+(?:ABV|ABOVE|@|AT|BUY|NEAR|CMP)\\s*[:\\-]?\\s*(\\d+(?:\\.\\d+)?)`, 'i'),
      new RegExp(`(?:BUY|LONG|SELL)\\s+#?([A-Z][A-Z0-9&]+)\\s+(?:${MONTH_PAT}\\s+)?(\\d+)\\s+(CE|PE)\\s+(?:@|AT|ABV|ABOVE|NEAR|CMP)?\\s*[:\\-]?\\s*(\\d+(?:\\.\\d+)?)`, 'i'),
      new RegExp(`#?([A-Z][A-Z0-9&]+)\\s+(?:${MONTH_PAT}\\s+)?(\\d+)\\s+(CE|PE)\\s+(\\d+(?:\\.\\d+)?)`, 'i'),
      new RegExp(`#([A-Z][A-Z0-9&]+)\\s+(?:${MONTH_PAT}\\s+)?(\\d+)\\s+(CE|PE)\\s*[:\\-@]?\\s*(\\d+(?:\\.\\d+)?)`, 'i'),
      new RegExp(`([A-Z][A-Z0-9&]+)\\s+(CE|PE)\\s+(\\d+)\\s+(?:@|AT|ABV|ABOVE|NEAR|CMP)?\\s*[:\\-]?\\s*(\\d+(?:\\.\\d+)?)`, 'i'),
      new RegExp(`([A-Z][A-Z0-9&]+)\\s+(\\d+)\\s+(CE|PE)\\s*\\n.*?(?:@|AT|ABV|ABOVE|NEAR|CMP|BUY|ENTRY)?\\s*[:\\-]?\\s*(\\d+(?:\\.\\d+)?)`, 'is'),
    ];

    for (let pi = 0; pi < stockPatterns.length; pi++) {
      const pattern = stockPatterns[pi];
      const match = text.match(pattern);
      if (match) {
        let stockName, strikePrice, optionType, entryPrice;

        if (pi === 4) {
          stockName = match[1];
          optionType = match[2].toUpperCase();
          strikePrice = parseFloat(match[3]);
          entryPrice = parseFloat(match[4]);
        } else {
          stockName = match[1].replace(/^#/, '');
          strikePrice = parseFloat(match[2]);
          optionType = match[3].toUpperCase();
          entryPrice = parseFloat(match[4]);
        }

        if (EXPIRY_MONTHS.test(stockName)) {
          const priorMatch = text.match(new RegExp(`([A-Z][A-Z0-9&]+)\\s+${stockName}`, 'i'));
          if (priorMatch) stockName = priorMatch[1];
        }

        if (entryPrice < 0.1 || strikePrice < 1) continue;

        let stopLoss = null;
        const slPatterns = [
          /SL\s*[:\-]?\s*(\d+(?:\.\d+)?)/i,
          /STOP\s*LOSS\s*[:\-]?\s*(\d+(?:\.\d+)?)/i,
          /STOPLOSS\s*[:\-]?\s*(\d+(?:\.\d+)?)/i,
        ];
        for (const slP of slPatterns) {
          const slMatch = text.match(slP);
          if (slMatch) { stopLoss = parseFloat(slMatch[1]); break; }
        }

        let targets = [];
        const tgtPatterns = [
          /TGT?\s*[:\-]?\s*([\d\s,.\-/+]+)/i,
          /TARGET\s*[:\-]?\s*([\d\s,.\-/+]+)/i,
          /TARGETS?\s*[:\-]?\s*([\d\s,.\-/+]+)/i,
        ];
        for (const tP of tgtPatterns) {
          const tgtMatch = text.match(tP);
          if (tgtMatch) {
            targets = tgtMatch[1].split(/[\s,\-/+]+/).filter(t => t && !isNaN(parseFloat(t)) && parseFloat(t) > 0).map(t => t.trim());
            break;
          }
        }

        const niftyBanknifty = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX'];
        const segment = niftyBanknifty.includes(stockName.toUpperCase()) ? 'INDEX OPTION' : 'STOCK OPTION';
        const tradeType = upperText.includes('POSITIONAL') || upperText.includes('BTST') ? 'POSITIONAL' : 'INTRADAY';

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
