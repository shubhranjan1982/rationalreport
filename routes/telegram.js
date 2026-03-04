const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { query, queryOne } = require('../config/database');
const { generateUUID, parseTelegramTradeMessage } = require('../utils/helpers');
const { requireActiveSubscription, getClientId } = require('../middleware/auth');

router.use(requireActiveSubscription);

async function tgGet(url) {
  try {
    const resp = await fetch(url, { timeout: 10000 });
    if (!resp.ok) return null;
    return await resp.json();
  } catch (e) {
    return null;
  }
}

async function tgBatchDelete(tgApi, relayChannelId, msgIds) {
  if (!msgIds || msgIds.length === 0) return;
  const batchSize = 20;
  for (let i = 0; i < msgIds.length; i += batchSize) {
    const chunk = msgIds.slice(i, i + batchSize);
    const promises = chunk.map(mid => {
      const params = new URLSearchParams({
        chat_id: relayChannelId,
        message_id: String(mid),
      });
      return fetch(`${tgApi}/deleteMessage?${params.toString()}`, { timeout: 5000 }).catch(() => {});
    });
    await Promise.all(promises);
  }
}

async function getTelegramSettings(clientId) {
  if (clientId) {
    const s = await queryOne('SELECT * FROM analyst_settings WHERE client_id = ? LIMIT 1', [clientId]);
    if (s) return s;
  }
  return await queryOne('SELECT * FROM analyst_settings LIMIT 1');
}

async function tgForwardAndRead(tgApi, relayChannelId, fromChatId, msgId, retries = 2, deleteQueue = null) {
  const params = new URLSearchParams({
    chat_id: relayChannelId,
    from_chat_id: fromChatId,
    message_id: String(msgId),
    disable_notification: 'true',
  });
  try {
    const data = await tgGet(`${tgApi}/forwardMessage?${params.toString()}`);

    if (!data || !data.ok) {
      if (data && data.error_code === 429 && retries > 0) {
        const wait = Math.min((data.parameters && data.parameters.retry_after) || 2, 3);
        await new Promise(r => setTimeout(r, wait * 1000));
        return tgForwardAndRead(tgApi, relayChannelId, fromChatId, msgId, retries - 1, deleteQueue);
      }
      const notFound = (data && data.description && data.description.includes('not found')) || false;
      return { ok: false, notFound };
    }

    const fwdMsg = data.result;
    if (deleteQueue) deleteQueue.push(fwdMsg.message_id);

    const isNested = fwdMsg.forward_from_chat &&
      String(fwdMsg.forward_from_chat.id) !== String(fromChatId);
    const timestamp = fwdMsg.forward_date || fwdMsg.date;
    const dt = new Date(timestamp * 1000);
    const dateStr = dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    return { ok: true, msg: fwdMsg, dateStr, isNested: !!isNested };
  } catch (err) {
    return { ok: false, notFound: false };
  }
}

async function findLatestMsgId(tgApi, relayChannelId, fromChatId, deleteQueue = null) {
  let upper = 10;
  let lastOk = 0;
  while (upper < 200000) {
    const r = await tgForwardAndRead(tgApi, relayChannelId, fromChatId, upper, 2, deleteQueue);
    if (r.ok) { lastOk = upper; upper *= 2; }
    else if (r.notFound) { break; }
    else { upper *= 2; }
  }
  if (lastOk === 0) return 0;
  let lo = lastOk;
  let hi = upper;
  while (lo < hi - 1) {
    const mid = Math.floor((lo + hi) / 2);
    const r = await tgForwardAndRead(tgApi, relayChannelId, fromChatId, mid, 2, deleteQueue);
    if (r.ok) lo = mid;
    else if (r.notFound) hi = mid;
    else lo = mid;
  }
  return lo;
}

async function probeDate(tgApi, relayChannelId, fromChatId, msgId, radius = 20, targetDate = null, deleteQueue = null) {
  for (let offset = 0; offset <= radius; offset++) {
    const ids = offset === 0 ? [msgId] : [msgId + offset, msgId - offset];
    for (const id of ids) {
      if (id < 1) continue;
      const r = await tgForwardAndRead(tgApi, relayChannelId, fromChatId, id, 2, deleteQueue);
      if (r.ok && !r.isNested) {
        if (targetDate) {
          const d1 = new Date(r.dateStr);
          const d2 = new Date(targetDate);
          const diffDays = Math.abs(Math.ceil((d1 - d2) / (1000 * 60 * 60 * 24)));
          if (diffDays > 90) continue;
        }
        return r.dateStr;
      }
    }
  }
  return null;
}

function buildSummaryText(settings, trades, date, groupName) {
  let text = 'TRADE PERFORMANCE SUMMARY\n';
  text += `Date: ${date}\n`;
  if (groupName) text += `Group: ${groupName}\n`;
  text += '-'.repeat(30) + '\n\n';

  let totalPL = 0, profitCount = 0, lossCount = 0;
  trades.forEach((trade, i) => {
    const pl = trade.profit_loss_amount || 0;
    totalPL += pl;
    if (pl >= 0) profitCount++; else lossCount++;
    const emoji = pl >= 0 ? '\u2705' : '\u274C';
    text += `${emoji} *#${i + 1} ${trade.stock_name}*`;
    if (trade.strike_price) text += ` ${trade.strike_price}`;
    if (trade.option_type) text += ` ${trade.option_type}`;
    text += '\n';
    text += `Entry: ${trade.entry_price}`;
    if (trade.exit_price) text += ` | Exit: ${trade.exit_price}`;
    text += `\nP/L: ${pl >= 0 ? '+' + pl : pl}/-\n\n`;
  });

  text += '-'.repeat(30) + '\n';
  text += `Total P/L: ${totalPL >= 0 ? '+' + totalPL : totalPL}/-\n`;
  text += `Profit: ${profitCount} | Loss: ${lossCount}\n`;
  const total = profitCount + lossCount;
  text += `Accuracy: ${total > 0 ? (profitCount / total * 100).toFixed(1) : 0}%\n\n`;
  if (settings.company_name) text += `${settings.company_name}\n`;
  if (settings.sebi_reg_number) text += `SEBI: ${settings.sebi_reg_number}\n`;
  text += `\n_${settings.disclaimer_text || 'Standard SEBI disclaimer applies.'}_`;

  return { summaryText: text, totalPL, profitCount, lossCount };
}

async function fetchTradesForSummary(tradeIds, clientId) {
  const trades = [];
  for (const tid of tradeIds) {
    const t = await queryOne('SELECT * FROM trades WHERE id = ?', [tid]);
    if (!t) continue;
    if (clientId && t.client_id !== clientId) continue;
    trades.push(t);
  }
  return trades;
}

async function resolveChannelGroup(settings, channelGroupId) {
  let freeChannelId = settings.free_channel_id || '';
  let groupName = '';
  if (channelGroupId) {
    const group = await queryOne('SELECT * FROM channel_groups WHERE id = ?', [channelGroupId]);
    if (group) { freeChannelId = group.free_channel_id; groupName = group.name; }
  }
  return { freeChannelId, groupName };
}

router.post('/test', async (req, res) => {
  try {
    const clientId = getClientId(req);
    const settings = await getTelegramSettings(clientId);
    if (!settings || !settings.telegram_bot_token) return res.status(400).json({ message: 'Bot token not configured' });

    const url = `https://api.telegram.org/bot${settings.telegram_bot_token}/getMe`;
    const data = await tgGet(url);

    if (data && data.ok) {
      res.json({ success: true, botName: data.result.username });
    } else {
      res.status(400).json({ message: 'Invalid bot token or Telegram API unreachable' });
    }
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.post('/fetch-trades', async (req, res) => {
  try {
    const clientId = getClientId(req);
    const { date: reqDate, channelGroupId } = req.body;
    const date = reqDate || new Date().toISOString().slice(0, 10);

    const settings = await getTelegramSettings(clientId);
    if (!settings || !settings.telegram_bot_token) return res.status(400).json({ message: 'Telegram bot token not configured in Settings.' });

    const relayChannelId = settings.private_relay_channel_id || '';
    if (!relayChannelId) {
      return res.status(400).json({ message: 'Private Relay Channel ID not configured in Settings. Create a private channel with only you and the bot, then add its ID in Settings.' });
    }

    const paidChannels = [];
    if (channelGroupId) {
      const group = await queryOne('SELECT * FROM channel_groups WHERE id = ?', [channelGroupId]);
      if (!group) return res.status(404).json({ message: 'Channel group not found' });
      paidChannels.push({ channelId: group.paid_channel_id, groupId: group.id, segment: group.segment });
    } else {
      let sql = 'SELECT * FROM channel_groups WHERE is_active = 1';
      const params = [];
      if (clientId) { sql += ' AND client_id = ?'; params.push(clientId); }
      const groups = await query(sql, params);
      if (groups.length > 0) {
        for (const g of groups) paidChannels.push({ channelId: g.paid_channel_id, groupId: g.id, segment: g.segment });
      } else if (settings.paid_channel_id) {
        paidChannels.push({ channelId: settings.paid_channel_id, groupId: null, segment: 'STOCK OPTION' });
      }
    }
    if (paidChannels.length === 0) return res.status(400).json({ message: 'No paid channels configured. Add channel groups in Settings.' });

    const botToken = settings.telegram_bot_token;
    const tgApi = `https://api.telegram.org/bot${botToken}`;

    const deleteQueue = [];

    const existingMsgIds = {};
    const existingRows = await query('SELECT entry_message_id FROM trades WHERE trade_date = ? AND entry_message_id IS NOT NULL', [date]);
    for (const row of existingRows) { existingMsgIds[row.entry_message_id] = true; }

    const createdTrades = [];
    let totalScanned = 0;
    const MAX_SCAN = 800;

    for (const channelInfo of paidChannels) {
      let latestMsgId = await findLatestMsgId(tgApi, relayChannelId, channelInfo.channelId, deleteQueue);
      if (latestMsgId === 0) {
        await new Promise(r => setTimeout(r, 2000));
        latestMsgId = await findLatestMsgId(tgApi, relayChannelId, channelInfo.channelId, deleteQueue);
      }
      if (latestMsgId === 0) continue;

      let scanStart = latestMsgId;
      let scanEnd = 1;

      if (date) {
        const nowIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

        const probeDates = [];
        for (let offset = 0; offset <= 30 && probeDates.length < 5; offset++) {
          const id = latestMsgId - offset;
          if (id < 1) break;
          const r = await tgForwardAndRead(tgApi, relayChannelId, channelInfo.channelId, id, 2, deleteQueue);
          if (r.ok) probeDates.push(r.dateStr);
        }

        if (probeDates.length > 0) {
          const latestDate = probeDates.reduce((a, b) => a > b ? a : b);
          const latestDateDiff = Math.abs(Math.ceil((new Date(date) - new Date(latestDate)) / (1000 * 60 * 60 * 24)));
          if (latestDate < date && latestDateDiff > 30) {
            continue;
          }
        }

        const daysDiff = Math.max(1, Math.ceil(Math.abs((new Date(nowIST) - new Date(date)) / (1000 * 60 * 60 * 24))));
        const idsPerDay = latestMsgId > 5000 ? 120 : Math.max(5, Math.floor(latestMsgId / Math.max(1, daysDiff)));
        const estimatedCenter = latestMsgId - (daysDiff * idsPerDay);
        const bufferIds = Math.max(150, idsPerDay);

        let bsLo = -1;
        let bsHi = -1;

        if (latestMsgId > 50) {
          let nullCount = 0;
          let lo = 1;
          let hi = latestMsgId;
          for (let step = 0; step < 25 && lo < hi - 5; step++) {
            const mid = Math.floor((lo + hi) / 2);
            const midDate = await probeDate(tgApi, relayChannelId, channelInfo.channelId, mid, 20, date, deleteQueue);
            if (midDate === null) {
              nullCount++;
              if (nullCount >= 3) break;
              lo = mid + 20;
              continue;
            }
            nullCount = 0;
            if (midDate <= date) lo = mid;
            else hi = mid;
          }
          if (nullCount < 3) {
            bsLo = lo;
            bsHi = hi;
          }

          if (bsLo > 0) {
            scanEnd = Math.max(1, bsLo - bufferIds);
            scanStart = Math.min(latestMsgId, bsHi + bufferIds);
          } else {
            scanEnd = Math.max(1, estimatedCenter - bufferIds);
            scanStart = Math.min(latestMsgId, Math.max(1, estimatedCenter + bufferIds));
          }

          if (scanEnd > scanStart) {
            scanStart = latestMsgId;
            scanEnd = 1;
          }
        }
      }

      let consecutiveErrors = 0;
      let consecutiveBeforeTarget = 0;
      let consecutiveAfterTarget = 0;
      let hadTargetDateMatch = false;

      for (let msgId = scanStart; msgId >= scanEnd && totalScanned < MAX_SCAN; msgId--) {
        totalScanned++;
        if (consecutiveErrors >= 50) break;

        const result = await tgForwardAndRead(tgApi, relayChannelId, channelInfo.channelId, msgId, 2, deleteQueue);
        if (!result.ok) {
          if (result.notFound) consecutiveErrors++;
          continue;
        }
        consecutiveErrors = 0;
        const fwdMsg = result.msg;
        const msgDate = result.dateStr;

        let effectiveDate = msgDate;
        if (date && result.isNested && msgDate !== date) {
          effectiveDate = date;
        }

        if (date && effectiveDate !== date) {
          if (effectiveDate < date) {
            consecutiveBeforeTarget++;
            if (consecutiveBeforeTarget >= 10) break;
            continue;
          }
          consecutiveBeforeTarget = 0;
          consecutiveAfterTarget++;
          if (hadTargetDateMatch && consecutiveAfterTarget >= 30) break;
          continue;
        }
        consecutiveBeforeTarget = 0;
        consecutiveAfterTarget = 0;
        hadTargetDateMatch = true;

        const text = fwdMsg.text || fwdMsg.caption || '';
        if (!text) continue;

        const entryMsgId = String(fwdMsg.forward_from_message_id || msgId);
        if (existingMsgIds[entryMsgId]) continue;

        const parsed = parseTelegramTradeMessage(text);
        if (parsed) {
          const tradeId = generateUUID();
          await query(
            'INSERT INTO trades (id, client_id, trade_date, stock_name, option_type, strike_price, entry_price, exit_price, stop_loss, lot_size, trade_type, segment, channel_group_id, entry_message_id, raw_messages) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [tradeId, clientId, effectiveDate, parsed.stockName, parsed.optionType || '', parsed.strikePrice || null,
             parsed.entryPrice, parsed.exitPrice || null, parsed.stopLoss || null, parsed.lotSize || 1,
             parsed.tradeType || 'INTRADAY', channelInfo.segment || parsed.segment || 'STOCK OPTION',
             channelInfo.groupId, entryMsgId, JSON.stringify([text])]
          );
          createdTrades.push(tradeId);
          existingMsgIds[entryMsgId] = true;
        }
      }
    }

    await tgBatchDelete(tgApi, relayChannelId, deleteQueue);

    res.json({ trades: createdTrades, count: createdTrades.length, message: `${createdTrades.length} trades fetched from Telegram` });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.post('/preview-summary', async (req, res) => {
  try {
    const clientId = getClientId(req);
    const { date, tradeIds, channelGroupId } = req.body;
    if (!date || !Array.isArray(tradeIds) || tradeIds.length === 0) return res.status(400).json({ message: 'Date and at least one trade ID are required' });

    const settings = await getTelegramSettings(clientId);
    const channelInfo = await resolveChannelGroup(settings, channelGroupId);
    const trades = await fetchTradesForSummary(tradeIds, clientId);
    if (trades.length === 0) return res.status(400).json({ message: 'No trades selected' });

    const result = buildSummaryText(settings, trades, date, channelInfo.groupName);
    const tradeDetails = trades.map((t, i) => ({
      index: i + 1, stockName: t.stock_name, strikePrice: t.strike_price, optionType: t.option_type,
      lotSize: t.lot_size, entryPrice: t.entry_price, exitPrice: t.exit_price,
      profitLossAmount: t.profit_loss_amount, segment: t.segment, tradeType: t.trade_type,
    }));

    res.json({ summaryText: result.summaryText, totalPL: result.totalPL, profitCount: result.profitCount,
      lossCount: result.lossCount, tradeCount: trades.length, groupName: channelInfo.groupName,
      channelId: channelInfo.freeChannelId, trades: tradeDetails });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.post('/post-summary', async (req, res) => {
  try {
    const clientId = getClientId(req);
    const { date: reqDate, tradeIds, channelGroupId } = req.body;
    const date = reqDate || new Date().toISOString().slice(0, 10);

    const settings = await getTelegramSettings(clientId);
    if (!settings || !settings.telegram_bot_token) return res.status(400).json({ message: 'Telegram bot token not configured' });

    const channelInfo = await resolveChannelGroup(settings, channelGroupId);
    if (!channelInfo.freeChannelId) return res.status(400).json({ message: 'No free channel configured for this group' });

    const trades = await fetchTradesForSummary(tradeIds, clientId);
    if (trades.length === 0) return res.status(400).json({ message: 'No trades selected' });

    const result = buildSummaryText(settings, trades, date, channelInfo.groupName);

    const resp = await fetch(`https://api.telegram.org/bot${settings.telegram_bot_token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: channelInfo.freeChannelId, text: result.summaryText, parse_mode: 'Markdown' }),
    });
    const tgResult = await resp.json();

    if (tgResult && tgResult.ok) {
      for (const tid of tradeIds) {
        await query('UPDATE trades SET is_posted = 1 WHERE id = ?', [tid]);
      }
      res.json({ success: true, messageId: tgResult.result.message_id });
    } else {
      res.status(400).json({ message: 'Failed to send to Telegram: ' + (tgResult.description || 'Unknown error') });
    }
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;
