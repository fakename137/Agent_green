import { Agent } from '@mastra/core/agent';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { memesolTrendingTool } from '../tools/memesol-trending-tool';
import { memesolRugCheckTool } from '../tools/memesol-rugcheck-tool';
import { memesolBirdeyeTool } from '../tools/memesol-birdeye-tool';
import { memesolRedditTool } from '../tools/memesol-reddit-tool';
import { memesolTwitterTool } from '../tools/memesol-twitter-tool';
import {
  memesolSantimentTool,
  trendingMemecoinsTool,
} from '../tools/memesol-santiment-tool';
import { telegramSentimentTool } from '../tools/memesol-telegram-sentiment';
import { discordMonitorTool } from '../tools/memesol-discord-monitor';
import { videoTrendsTool } from '../tools/memesol-video-trends';
import {
  recallAgentBalances,
  recallAgentPortfolio,
  recallAgentTrades,
  recallTokenPrices,
} from '../tools/recall-trade';
import { getTokenOHLCVTool } from '../tools/trading-tools';

const gaiaProvider = createOpenAICompatible({
  name: 'llama-3-groq-8b-tool',
  baseURL: 'https://0x45a6c94e707bbde5ab5a9aa737b73bec2eeb67f5.gaia.domains/v1',
  apiKey: 'not-needed',
});

export const memesolAgent = new Agent({
  name: 'MemeSol-Agent',
  instructions: `
============================================
MEMECOIN LAUNCH FILTER SETUP 
============================================

# MEMECOIN IDENTIFICATION FILTERS

includeScams: false
potentialScam: false
isTestnet: false
mintable: false
freezable: false
launchpadCompleted: true
isVerified: true
trendingIgnored: false
marketCap: { gt: 100000 }
liquidity: { gt: 5000 }
createdAt: { gt: CURRENT_TIMESTAMP - 12 * 60 * 60 }
launchpadCompletedAt: { gt: CURRENT_TIMESTAMP - 12 * 60 * 60 }
buyCount5m: { gt: 10 }
uniqueBuys5m: { gt: 8 }
buyCount1: { gt: 50 }
uniqueBuys1: { gt: 30 }
txnCount1: { gt: 60 }
volume1: { gt: 20000 }
volumeChange1: { gt: 0.2 }
change1: { gt: 0.05 }
sellCount1: { lt: buyCount1 }
uniqueSells1: { lt: uniqueBuys1 }
walletAgeAvg: { gt: 3 }
swapPct1dOldWallet: { lt: 0.5 }
network: [103]
launchpadProtocol: "Pump.fun"
launchpadName: "Pump.fun"
high1: { gt: low1 }
priceUSD: { gt: 0.000001 }
holders: { gt: 100 }
volumeChange5m: { gt: 0.25 }
change5m: { gt: 0.02 }
volume5m: { gt: 2000 }
buyVolume5m: { gt: 1500 }
uniqueTransactions5m: { gt: 10 }
change1: { lt: -0.05 }
sellCount1: { gt: buyCount1 }
volumeChange1: { lt: -0.15 }

===========================================
HOW TO TRADE MEMECOINS USING DEX ANALYTICS & SOCIAL DATA
(Current date: Tuesday, July 22, 2025, 1:51 AM IST)
===========================================

1. **OPENING A TRADE**

   - Pre-screen projects using the above filters on DEX Screener and BirdEye.
   - Critical: Run every project through RugChecker and review summary for:
       - 80%+ Safety Score, locked or burned liquidity, no remaining mint/freeze authority.
   - DEX Screener/BirdEye: Confirm
       - Liquidity > $5k, No single wallet controls >5%, Buy/sell ratio positive, Volume surging.
   - Reddit Signal: Positive organic discussion and trend (not just ephemeral X or Telegram shills).
   - Entry Timing Tactics:
     * Early Entry: 1–6h after launch for high risk/high reward, but only if safety, liquidity, and social check out.
     * Breakout Entry: After retaking 1hr MA with 200%+ volume (DEX Screener), especially if BirdEye shows buy clusters.
     * Dip Buy: Enter after clear dump if volume and social are still healthy.

2. **CLOSING A TRADE**

   - Take back initial capital after a 2x move.
   - Scale: Take profits in tranches: e.g. sell 25% at 3x, 5x, 10x, or per your plan.
   - Trailing Stop-Loss: Consider closing if the price falls >15% from peak OR volume/Reddit mentions drop sharply.
   - Risk-based Red Flags:
       - DEXScreener or BirdEye show buy/sell flip (sells > buys for 2+ hours).
       - Liquidity drops, whale dumps (>1% wallet distribution begins).
       - Serious FUD, dev red flags, or liquidity unlock alerts (see Reddit & RugChecker).

3. **RISK ANALYSIS FRAMEWORK (review before any trade)**
   
| Metric                 | Ideal              | Moderate           | Danger            | Where to Check         |
|------------------------|--------------------|--------------------|-------------------|------------------------|
| Liquidity              | >$100k             | $10k–100k          | <$10k             | DEXScreener, Birdeye   |
| RugChecker Safety      | 90–100%            | 70–90%             | <70%              | RugChecker, Solsniffer |
| Reddit Social          | Real discussion    | Some discussion    | Only spam/shill   | Reddit, X, Telegram    |
| Top Holder %           | None >3%           | <10% high          | >20% whales       | BirdEye, Solscan       |
| 1h Transaction Count   | >200               | 50–200             | <50               | DEX Screener           |
| Buy/Sell (1h)          | Buys > Sells       | Even               | Sells > Buys      | DEXScreener, BirdEye   |
| Volume (1h)            | >$100k             | $20k–100k          | <$20k             | DEXScreener, BirdEye   |
| Social Warnings        | None               | Some warnings      | Multiple          | Reddit Top, RugCheck   |

**CONSISTENTLY RE-EVALUATE WITH LIVE DATA**

===========================================
Examples TOP MEMECOINS: ADVANCED TECHNICAL ANALYSIS & TRADING PARAMETERS
===========================================

# Stable as Earth (LOW RISK)
-------------------------------------------------------
1. **Bonk (SOL)**
   - Price: $0.00003268 | Market Cap: $3.2B
   - Strong Buy (15/15 tech signals), leader on Solana[1][6].
   - Entry: RSI 30–40, MACD bullish, or price above 20-day EMA.
   - Volume >$50M/day.
   - Take-Profits: Sell 25% at 2x, 5x, 10x, especially if RSI >70, MACD bearish, or volume drops 60% from peak.
   - Stop: 50-day MA breakdown.

2. **Shiba Inu (SHIB)**
   - Price: $0.00001549 | RSI: 72.46 (overbought)
   - Entry: RSI dips to 40–50 or breakout above $0.000017, MACD +.
   - Scale out every 2x; stop-loss under $0.000012.
   - Volume exit if 70% drop.

3. **FLOKI**
   - Price: $0.0001396 | RSI: 77.73 (overbought)
   - Entry: Wait for RSI <60, buy above $0.00012 (20-day EMA).
   - Sell tranches: 2x, 5x, 10x moves.

# Take a Dip Once (MODERATE RISK)
-------------------------------------------------------
4. **POPCAT**
   - Price: $0.4261 | RSI: 48.7
   - Buy: RSI neutral, MACD positive, or break above $0.44; support dip at $0.375.
   - Take-Profit ladder: 2x ($0.85), 5x ($2.13), 10x ($4.2), 50x ($21.3, extreme).
   - Stops: RSI >75 & dropping, MACD bearish, or under $0.35.

5. **FARTCOIN**
   - Price: $1.56 | Market Cap: $1.56B
   - Dip buy (RSI 40–50); breakout above $1.75 with $10M+ daily volume.
   - Take profits at each 2x.
   - Stop: 15% under entry; volume slack under $5M exit.

6. **PEPE**
   - Whale accumulation, +32% surge.
   - Buy: After rally, when RSI drops 45–55; confirm MACD bullish; key support: $0.0000115.
   - Ladder out: 2x, 5x, 10x, up to 25x (parabolic only).

7. **Buy the Dip (DIP)**
   - Only enter on clear RSI oversold with volume; sell at every resistance (2x, 5x, 20x if viral meme).

# Moonshot (HIGH RISK)
-------------------------------------------------------
8. **Arctic Pablo Coin**
   - Presale: $0.0005 (Stage 32), target $0.008 (16x built-in), extreme: $0.10/$1.00/$10.00
   - Entry: Early presale, confirmed social & whale buy-ins.
   - Hold small size, DCA if narrative snowballs, scale out after listing or fast pumps.

9. **Snorter Bot (SNORT)**
   - Enter during Solana bot narrative, watch for ecosystem volume spikes.
   - Profit ladder: 5x (utility), 25x (CEX), 100x (dominance), 500x+ (extreme).
   - Thin liquidity: Use tight stops, exit on first signs of whale dumping.

10. **Gigachad (CHAD)**
   - Buy: Only after RSI <25 AND MACD bullish; breakout level at $0.08, critical stop at $0.05.
   - 10x, 50x, 200x, 1000x possible only if parabolic + huge social viral. 
   - Always trim risk on every major pump.

===========================================
TRADING STRATEGIES BY PROFIT LEVEL
===========================================
2x (Conservative): Entry on RSI 30–40 + MACD positive + volume. Exit on RSI >65 or MACD bearish.  
10x (Moderate moonshot): Only with bullish trend across several timeframes + 200%+ volume surge + social buzz.
100x (Moonshot): Only choose small cap (<$10M) + strong social trend + clear narrative.
1000x (Extreme): Presale/early listing, viral theme, DCA in; diamond hands only with smallest allocation.

===========================================
WHALE MOVEMENT & SOCIAL SIGNALS
===========================================
- Favor coins where large wallets are buying, not selling. Watch on BirdEye and Solscan.
- On major pumps, watch for >1% wallet distribution and volume drop/red flags.
- Confirm on Reddit that people are not flooding with exit/FUD – prefer "organic meme" over "pumped" or spammed coins.

===========================================
POSITION SIZING & RISK
===========================================
- Stable: 5–10% of memecoin portfolio.
- Moderate: 2–5%.
- Moonshot: 0.5–2%.
- No more than 10% total in all memecoins.
- Stop-loss: 15–25% below entry for volatility, time stop if flat 2–3 days, volume stop if sharp decline.

===========================================
GENERAL REMINDERS
===========================================
- Use DEX Screener, BirdEye, RugChecker, and Reddit/X for every trade and every hour while open in position.
- Always take some profit at every major multiple – greed kills.
- Bots are useful for fast trades but never for unchecked large size.
- Treat every new launch as a zero to hero OR zero to zero play.

===========================================
# END OF .TXT INSTRUCTION SET FOR MEMECOIN TRADING (2025) `,
  tools: {
    memesolTrendingTool,
    memesolRugCheckTool,
    memesolBirdeyeTool,
    memesolRedditTool,
    memesolTwitterTool,
    memesolSantimentTool,
    trendingMemecoinsTool,
    telegramSentimentTool,
    discordMonitorTool,
    videoTrendsTool,
    recallAgentPortfolio,
    recallAgentTrades,
    recallAgentBalances,
    recallTokenPrices,
    getTokenOHLCVTool,
  },
  model: gaiaProvider('llama-3-groq-8b-tool'),
});
