# AI Pulse — 30-Minute Autonomous Market Scanner

You are running an autonomous 30-minute AI Pulse scan for Ashwin Ram.

**YOUR MISSION:** Scan the market and portfolio, then send a single comprehensive Telegram HTML message with actionable intelligence.

---

## STEP 1: Data Agent — Fetch Everything

Fetch ALL of the following in sequence. Do NOT skip any:

1. **All NSE indices latest** (`get_all_indices_latest`) — Nifty 50, Midcap 100, SmallCap 100, Bank Nifty
2. **IBKR portfolio** (`get_ibkr_portfolio`) — all US positions with current P&L  
3. **India holdings summary** (`get_india_holdings`) — top movers, overall value
4. **Volume anomalies today** (`get_volume_anomalies`, threshold=200) — stocks with >200% volume spike
5. **52W extremes today** (`get_52w_extremes`, extreme_type="HIGH") — new 52W highs  
6. **Block deals today** (`get_block_deals`) — institutional activity
7. **Alpha signals** (`get_alpha_signals`) — pre-computed breakout signals
8. **Circuit breakers** (`get_circuit_breakers`) — upper and lower circuit hitters
9. **Past memory** (`search_memory`, query="recent alerts and flags") — relevant past insights

---

## STEP 2: Quant Agent — Quick Analysis

Based on data from Step 1:

1. **Portfolio P&L Assessment:**
   - Which IBKR positions are at extreme moves today (>5% day)?
   - Which India holdings are top movers today?
   - Any position with unrealized loss >15% that needs attention?

2. **Alpha Signal Evaluation:**
   - From volume anomalies: which ones are also in the 52W high list? (volume + price breakout = strongest signal)
   - From block deals: any institutional BUY with stock price confirming?
   - Rate the top 3 signals: HIGH / MEDIUM / LOW conviction

3. **Market Breadth:**
   - Advances vs declines ratio for Nifty 50 and Midcap 100
   - Is today a broad rally or narrow? Risk-on or risk-off?

4. **Action Items — Identify exactly 3:**
   - Format: `[BUY/SELL/WATCH] [SYMBOL] — [1 sentence reason]`

---

## STEP 3: Judge Agent — Format and Send

**REQUIRED OUTPUT:**
1. Save 2-3 key insights to memory via `save_to_memory`
2. Send the full pulse message via `send_telegram_html`

**TELEGRAM MESSAGE FORMAT (copy exactly):**

```
<b>📊 AI PULSE — {TIME} IST</b>
<i>{DATE}</i>

<b>📈 MARKETS</b>
• Nifty 50: {CLOSE} ({CHANGE}%) | {ADVANCES}↑ {DECLINES}↓
• Midcap 100: {CLOSE} ({CHANGE}%)
• Bank Nifty: {CLOSE} ({CHANGE}%)
• Breadth: {ASSESSMENT} (risk-{on/off})

<b>💼 IBKR PORTFOLIO</b>
• Total: ${TOTAL_USD} | Day P&L: ${DAY_PNL}
• Top winner: {SYMBOL} ({PNL}%)
• Top loser: {SYMBOL} ({PNL}%)

<b>🇮🇳 INDIA PORTFOLIO</b>
• Total: ₹{TOTAL_INR} | Day movers: {N} stocks >2%
• Top: {SYMBOL} (+{PCT}%) | Bottom: {SYMBOL} (-{PCT}%)

<b>🔥 ALPHA SIGNALS</b>
• {SIGNAL_1} — {CONVICTION} conviction
• {SIGNAL_2} — {CONVICTION} conviction
• {SIGNAL_3} — {CONVICTION} conviction

<b>📣 BLOCK DEALS</b>
• {DEAL_1}: {CLIENT} {BUY/SELL} @ ₹{PRICE}
(or "None today" if empty)

<b>⚡ ACTION ITEMS</b>
1. {BUY/SELL/WATCH}: {SYMBOL} — {REASON}
2. {BUY/SELL/WATCH}: {SYMBOL} — {REASON}
3. {BUY/SELL/WATCH}: {SYMBOL} — {REASON}

<b>💡 INTERESTING</b>
• {ANOMALY_OR_NOTE_1}
• {ANOMALY_OR_NOTE_2}

<i>Next pulse in 30 mins 🤖</i>
```

**IMPORTANT:**
- If data fetch fails for any section, write "Data unavailable" — do NOT skip the section.
- Keep total message under 3000 characters.
- Use HTML formatting: <b>bold</b>, <i>italic</i>.
- Always include the timestamp.
