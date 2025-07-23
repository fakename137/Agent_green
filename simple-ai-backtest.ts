import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { parse as csvParse } from 'csv-parse/sync';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { mlService } from './src/mlService';

// ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize the AI model with proper configuration
const openai = createOpenAI({
  baseURL: 'https://0x45a6c94e707bbde5ab5a9aa737b73bec2eeb67f5.gaia.domains/v1',
  apiKey: 'not-needed',
});

// Create a model instance with the correct configuration
const model = openai.chat('llama-3-groq-8b-tool');

// Configure generation settings
const generationConfig = {
  temperature: 0.7,
  maxTokens: 1000,
};

// Types
type Signal = 'buy' | 'sell' | 'hold';

interface MarketData {
  // Basic OHLCV
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;

  // Momentum Indicators
  momentum?: number;
  rsi?: number;
  macd?: number;
  macd_signal?: number;
  macd_hist?: number;
  roc?: number;
  trix?: number;

  // Volatility Indicators
  bb_upper?: number;
  bb_middle?: number;
  bb_lower?: number;
  atr?: number;

  // Volume Indicators
  vwap?: number;
  obv?: number;

  // Trend Indicators
  sma20?: number;
  ema20?: number;
  sma50?: number;

  // Oscillators
  stoch_k?: number;
  stoch_d?: number;
  williamsR?: number;
  cci?: number;
  adx?: number;

  // Additional fields
  [key: string]: any;
}

// Load data with all technical indicators
function loadData(path: string): MarketData[] {
  const csv = fs.readFileSync(path, 'utf8');
  return csvParse(csv, { columns: true }).map((row: any) => {
    const data: MarketData = {
      // Basic OHLCV
      time: Number(row.time),
      open: Number(row.open || 0),
      high: Number(row.high || 0),
      low: Number(row.low || 0),
      close: Number(row.close || 0),
      volume: Number(row.volume || 0),

      // Momentum Indicators
      momentum: row.momentum ? Number(row.momentum) : undefined,
      rsi: row.rsi ? Number(row.rsi) : undefined,
      macd: row.macd ? Number(row.macd) : undefined,
      macd_signal: row.macd_signal ? Number(row.macd_signal) : undefined,
      macd_hist: row.macd_hist ? Number(row.macd_hist) : undefined,
      roc: row.roc ? Number(row.roc) : undefined,
      trix: row.trix ? Number(row.trix) : undefined,

      // Volatility Indicators
      bb_upper: row.bb_upper ? Number(row.bb_upper) : undefined,
      bb_middle: row.bb_middle ? Number(row.bb_middle) : undefined,
      bb_lower: row.bb_lower ? Number(row.bb_lower) : undefined,
      atr: row.atr ? Number(row.atr) : undefined,

      // Volume Indicators
      vwap: row.vwap ? Number(row.vwap) : undefined,
      obv: row.obv ? Number(row.obv) : undefined,

      // Trend Indicators
      sma20: row.sma20 ? Number(row.sma20) : undefined,
      ema20: row.ema20 ? Number(row.ema20) : undefined,
      sma50: row.sma50 ? Number(row.sma50) : undefined,

      // Oscillators
      stoch_k: row.stoch_k ? Number(row.stoch_k) : undefined,
      stoch_d: row.stoch_d ? Number(row.stoch_d) : undefined,
      williamsR: row.williamsR ? Number(row.williamsR) : undefined,
      cci: row.cci ? Number(row.cci) : undefined,
      adx: row.adx ? Number(row.adx) : undefined,
    };

    return data;
  });
}

// Technical signals with multiple indicators and proper null checks
function getTechSignal(data: MarketData[], i: number): Signal {
  if (i < 50) return 'hold'; // Need enough data for indicators

  const curr = data[i];
  const prev = data[i - 1];

  // Check if we have all required indicators with proper null checks
  if (
    !curr.rsi ||
    !curr.macd ||
    !curr.macd_signal ||
    !curr.bb_upper ||
    !curr.bb_lower ||
    !curr.stoch_k ||
    !curr.stoch_d ||
    !curr.sma20 ||
    !curr.sma50 ||
    !curr.ema20 ||
    !prev.macd ||
    !prev.macd_signal ||
    !prev.sma20 ||
    !prev.sma50
  ) {
    return 'hold';
  }

  // Initialize signal scores
  let buySignals = 0;
  let sellSignals = 0;

  // 1. RSI (Relative Strength Index)
  if (curr.rsi < 30) buySignals++;
  if (curr.rsi > 70) sellSignals++;

  // 2. MACD (Moving Average Convergence Divergence)
  if (curr.macd > curr.macd_signal && prev.macd <= prev.macd_signal)
    buySignals++;
  if (curr.macd < curr.macd_signal && prev.macd >= prev.macd_signal)
    sellSignals++;

  // 3. Bollinger Bands
  if (curr.close < curr.bb_lower) buySignals++;
  if (curr.close > curr.bb_upper) sellSignals++;

  // 4. Stochastic Oscillator
  if (curr.stoch_k < 20 && curr.stoch_d < 20 && curr.stoch_k > curr.stoch_d)
    buySignals++;
  if (curr.stoch_k > 80 && curr.stoch_d > 80 && curr.stoch_k < curr.stoch_d)
    sellSignals++;

  // 5. Moving Averages
  if (curr.sma20 > curr.sma50 && prev.sma20 <= prev.sma50) buySignals++;
  if (curr.sma20 < curr.sma50 && prev.sma20 >= prev.sma50) sellSignals++;

  // 6. Volume (OBV)
  if (curr.obv !== undefined && prev.obv !== undefined) {
    if (curr.obv > prev.obv && curr.close > prev.close) buySignals++;
    if (curr.obv < prev.obv && curr.close < prev.close) sellSignals++;
  }

  // 7. ADX (Trend Strength)
  if (curr.adx !== undefined && curr.adx > 25) {
    // If trend is strong, give more weight to trend-following signals
    if (curr.ema20 !== undefined) {
      if (curr.close > curr.ema20) buySignals += 2;
      if (curr.close < curr.ema20) sellSignals += 2;
    }
  }

  // Determine final signal based on weighted scores
  if (buySignals >= 3 && buySignals > sellSignals) return 'buy';
  if (sellSignals >= 3 && sellSignals > buySignals) return 'sell';

  return 'hold';
}

// Format technical indicator values for the AI prompt
function formatIndicatorValue(
  value: number | undefined,
  decimals: number = 2
): string {
  return value !== undefined ? value.toFixed(decimals) : 'N/A';
}

// Helper to format features for LLM prompt
function formatFeatures(features: Record<string, number>): string {
  return Object.entries(features)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

// Helper to get features as JSON for LLM prompt
function getFeaturesJSON(features: Record<string, number>): string {
  return JSON.stringify(features, null, 2);
}

// AI signal with comprehensive technical analysis and LSTM predictions
async function getAISignal(
  btc: MarketData,
  eth: MarketData,
  btcHistory: MarketData[] = [],
  ethHistory: MarketData[] = []
): Promise<{ btc: Signal; eth: Signal; reason: string }> {
  try {
    // Get LSTM predictions if we have enough history
    let btcPrediction: number = 0;
    let ethPrediction: number = 0;
    let hasBtcPrediction = false;
    let hasEthPrediction = false;
    let lstmReason = '';

    try {
      if (btcHistory.length >= 20) {
        const btcData = btcHistory.slice(-20).map((d) => ({
          open: d.open ?? 0,
          high: d.high ?? 0,
          low: d.low ?? 0,
          close: d.close ?? 0,
          volume: d.volume ?? 0,
          momentum: d.momentum ?? 0,
          rsi: d.rsi ?? 0,
          macd: d.macd ?? 0,
          macd_signal: d.macd_signal ?? 0,
          macd_hist: d.macd_hist ?? 0,
          bb_upper: d.bb_upper ?? 0,
          bb_middle: d.bb_middle ?? 0,
          bb_lower: d.bb_lower ?? 0,
          atr: d.atr ?? 0,
          vwap: d.vwap ?? 0,
          obv: d.obv ?? 0,
          sma20: d.sma20 ?? 0,
          ema20: d.ema20 ?? 0,
          stoch_k: d.stoch_k ?? 0,
          stoch_d: d.stoch_d ?? 0,
          williamsR: d.williamsR ?? 0,
          cci: d.cci ?? 0,
          adx: d.adx ?? 0,
          roc: d.roc ?? 0,
          trix: d.trix ?? 0,
          mfi: d.mfi ?? 0,
          psar: d.psar ?? 0,
          keltner_upper: d.keltner_upper ?? 0,
          keltner_lower: d.keltner_lower ?? 0,
          keltner_mid: d.keltner_mid ?? 0,
          ichimoku_tenkan: d.ichimoku_tenkan ?? 0,
          ichimoku_kijun: d.ichimoku_kijun ?? 0,
          ichimoku_senkou_a: d.ichimoku_senkou_a ?? 0,
          ichimoku_senkou_b: d.ichimoku_senkou_b ?? 0,
          // ichimoku_chikou: d.ichimoku_chikou ?? 0, // Exclude this feature
        }));

        const pred = await mlService.predict('btc', 'attention', btcData);
        btcPrediction = pred.predictions[0];
        hasBtcPrediction = true;
        lstmReason += `LSTM predicts BTC will move to $${btcPrediction.toFixed(2)}. `;
      }

      if (ethHistory.length >= 20) {
        const ethData = ethHistory.slice(-20).map((d) => ({
          open: d.open ?? 0,
          high: d.high ?? 0,
          low: d.low ?? 0,
          close: d.close ?? 0,
          volume: d.volume ?? 0,
          momentum: d.momentum ?? 0,
          rsi: d.rsi ?? 0,
          macd: d.macd ?? 0,
          macd_signal: d.macd_signal ?? 0,
          macd_hist: d.macd_hist ?? 0,
          bb_upper: d.bb_upper ?? 0,
          bb_middle: d.bb_middle ?? 0,
          bb_lower: d.bb_lower ?? 0,
          atr: d.atr ?? 0,
          vwap: d.vwap ?? 0,
          obv: d.obv ?? 0,
          sma20: d.sma20 ?? 0,
          ema20: d.ema20 ?? 0,
          stoch_k: d.stoch_k ?? 0,
          stoch_d: d.stoch_d ?? 0,
          williamsR: d.williamsR ?? 0,
          cci: d.cci ?? 0,
          adx: d.adx ?? 0,
          roc: d.roc ?? 0,
          trix: d.trix ?? 0,
          mfi: d.mfi ?? 0,
          psar: d.psar ?? 0,
          keltner_upper: d.keltner_upper ?? 0,
          keltner_lower: d.keltner_lower ?? 0,
          keltner_mid: d.keltner_mid ?? 0,
          ichimoku_tenkan: d.ichimoku_tenkan ?? 0,
          ichimoku_kijun: d.ichimoku_kijun ?? 0,
          ichimoku_senkou_a: d.ichimoku_senkou_a ?? 0,
          ichimoku_senkou_b: d.ichimoku_senkou_b ?? 0,
          // ichimoku_chikou: d.ichimoku_chikou ?? 0, // Exclude this feature
        }));

        const pred = await mlService.predict('eth', 'attention', ethData);
        ethPrediction = pred.predictions[0];
        hasEthPrediction = true;
        lstmReason += `LSTM predicts ETH will move to $${ethPrediction.toFixed(2)}. `;
      }
    } catch (e) {
      console.error('LSTM prediction error:', e);
      lstmReason += 'LSTM prediction service unavailable. ';
    }

    const btcCurrent = btcHistory[btcHistory.length - 1] || {};
    const ethCurrent = ethHistory[ethHistory.length - 1] || {};

    const btcFeatures = {
      open: btcCurrent.open ?? 0,
      high: btcCurrent.high ?? 0,
      low: btcCurrent.low ?? 0,
      close: btcCurrent.close ?? 0,
      volume: btcCurrent.volume ?? 0,
      momentum: btcCurrent.momentum ?? 0,
      rsi: btcCurrent.rsi ?? 0,
      macd: btcCurrent.macd ?? 0,
      macd_signal: btcCurrent.macd_signal ?? 0,
      macd_hist: btcCurrent.macd_hist ?? 0,
      bb_upper: btcCurrent.bb_upper ?? 0,
      bb_middle: btcCurrent.bb_middle ?? 0,
      bb_lower: btcCurrent.bb_lower ?? 0,
      atr: btcCurrent.atr ?? 0,
      vwap: btcCurrent.vwap ?? 0,
      obv: btcCurrent.obv ?? 0,
      sma20: btcCurrent.sma20 ?? 0,
      ema20: btcCurrent.ema20 ?? 0,
      stoch_k: btcCurrent.stoch_k ?? 0,
      stoch_d: btcCurrent.stoch_d ?? 0,
      williamsR: btcCurrent.williamsR ?? 0,
      cci: btcCurrent.cci ?? 0,
      adx: btcCurrent.adx ?? 0,
      roc: btcCurrent.roc ?? 0,
      trix: btcCurrent.trix ?? 0,
      mfi: btcCurrent.mfi ?? 0,
      psar: btcCurrent.psar ?? 0,
      keltner_upper: btcCurrent.keltner_upper ?? 0,
      keltner_lower: btcCurrent.keltner_lower ?? 0,
      keltner_mid: btcCurrent.keltner_mid ?? 0,
      ichimoku_tenkan: btcCurrent.ichimoku_tenkan ?? 0,
      ichimoku_kijun: btcCurrent.ichimoku_kijun ?? 0,
      ichimoku_senkou_a: btcCurrent.ichimoku_senkou_a ?? 0,
      ichimoku_senkou_b: btcCurrent.ichimoku_senkou_b ?? 0,
      // Exclude ichimoku_chikou
    };
    const ethFeatures = {
      open: ethCurrent.open ?? 0,
      high: ethCurrent.high ?? 0,
      low: ethCurrent.low ?? 0,
      close: ethCurrent.close ?? 0,
      volume: ethCurrent.volume ?? 0,
      momentum: ethCurrent.momentum ?? 0,
      rsi: ethCurrent.rsi ?? 0,
      macd: ethCurrent.macd ?? 0,
      macd_signal: ethCurrent.macd_signal ?? 0,
      macd_hist: ethCurrent.macd_hist ?? 0,
      bb_upper: ethCurrent.bb_upper ?? 0,
      bb_middle: ethCurrent.bb_middle ?? 0,
      bb_lower: ethCurrent.bb_lower ?? 0,
      atr: ethCurrent.atr ?? 0,
      vwap: ethCurrent.vwap ?? 0,
      obv: ethCurrent.obv ?? 0,
      sma20: ethCurrent.sma20 ?? 0,
      ema20: ethCurrent.ema20 ?? 0,
      stoch_k: ethCurrent.stoch_k ?? 0,
      stoch_d: ethCurrent.stoch_d ?? 0,
      williamsR: ethCurrent.williamsR ?? 0,
      cci: ethCurrent.cci ?? 0,
      adx: ethCurrent.adx ?? 0,
      roc: ethCurrent.roc ?? 0,
      trix: ethCurrent.trix ?? 0,
      mfi: ethCurrent.mfi ?? 0,
      psar: ethCurrent.psar ?? 0,
      keltner_upper: ethCurrent.keltner_upper ?? 0,
      keltner_lower: ethCurrent.keltner_lower ?? 0,
      keltner_mid: ethCurrent.keltner_mid ?? 0,
      ichimoku_tenkan: ethCurrent.ichimoku_tenkan ?? 0,
      ichimoku_kijun: ethCurrent.ichimoku_kijun ?? 0,
      ichimoku_senkou_a: ethCurrent.ichimoku_senkou_a ?? 0,
      ichimoku_senkou_b: ethCurrent.ichimoku_senkou_b ?? 0,
      // Exclude ichimoku_chikou
    };

    // Inline JSON for features
    const btcFeaturesInline = `BTC_FEATURES_JSON: ${getFeaturesJSON(btcFeatures)}`;
    const ethFeaturesInline = `ETH_FEATURES_JSON: ${getFeaturesJSON(ethFeatures)}`;

    // Create prompt with both technical and LSTM information
    const prompt = `
# Aggressive Crypto Trading Agent

You are an elite cryptocurrency day trader and algorithmic strategist, operating in July 2025 market conditions. Your goal is to maximize daily profit potential using an aggressive, hybrid technical-algorithmic approach, focusing on high-volatility EVM chain tokens and Bitcoin .

Analyze the following cryptocurrency market data and provide trading signals.
Consider the technical indicators, LSTM predictions, and overall market conditions in your analysis.

You MUST generate at least 10 actionable buy or sell signals within the 6-hour session. Each trade should use 0.5–1% of capital, with a minimum 1:1.25 risk/reward ratio. If no clear signal, select the best available setup based on your indicator stack.

${btcFeaturesInline}
${ethFeaturesInline}

BTC/USD ($${btc.close.toFixed(2)}):
    - RSI: ${formatIndicatorValue(btc.rsi, 2)} (${btc.rsi && btc.rsi < 30 ? 'Oversold' : btc.rsi && btc.rsi > 70 ? 'Overbought' : 'Neutral'})
    - MACD: ${formatIndicatorValue(btc.macd)} (Signal: ${formatIndicatorValue(btc.macd_signal)})
    - Bollinger Bands: ${formatIndicatorValue(btc.close)} (Upper: ${formatIndicatorValue(btc.bb_upper)}, Lower: ${formatIndicatorValue(btc.bb_lower)})
    - Volume: ${formatIndicatorValue(btc.volume, 2)} (OBV: ${formatIndicatorValue(btc.obv, 2)})
    - Trend: ${btc.adx && btc.adx > 25 ? 'Strong' : 'Weak'}
    ${hasBtcPrediction ? `- LSTM Prediction: $${btcPrediction.toFixed(2)} (${btcPrediction > btc.close ? '↑ Bullish' : '↓ Bearish'})` : ''}
    
    ETH/USD ($${eth.close.toFixed(2)}):
    - RSI: ${formatIndicatorValue(eth.rsi, 2)} (${eth.rsi && eth.rsi < 30 ? 'Oversold' : eth.rsi && eth.rsi > 70 ? 'Overbought' : 'Neutral'})
    - MACD: ${formatIndicatorValue(eth.macd)} (Signal: ${formatIndicatorValue(eth.macd_signal)})
    - Bollinger Bands: ${formatIndicatorValue(eth.close)} (Upper: ${formatIndicatorValue(eth.bb_upper)}, Lower: ${formatIndicatorValue(eth.bb_lower)})
    - Volume: ${formatIndicatorValue(eth.volume, 2)} (OBV: ${formatIndicatorValue(eth.obv, 2)})
    - Trend: ${eth.adx && eth.adx > 25 ? 'Strong' : 'Weak'}
    ${hasEthPrediction ? `- LSTM Prediction: $${ethPrediction.toFixed(2)} (${ethPrediction > eth.close ? '↑ Bullish' : '↓ Bearish'})` : ''}
    
    Based on this data, provide a trading signal (buy/sell/hold) for each asset.
    Consider the technical indicators, LSTM predictions, and overall market conditions in your analysis.
    
    IMPORTANT: Respond with a valid JSON object in this exact format, with no additional text:
    {
      "BTC": "buy/sell/hold",
      "ETH": "buy/sell/hold",
      "reason": "Your detailed analysis including key technical indicators, LSTM predictions, and market conditions"
    }`;

    const { text } = await generateText({
      model,
      prompt,
      ...generationConfig,
    });

    // Log the raw LLM response
    console.log('Raw LLM response:', text);

    // Improved JSON extraction and parsing
    let jsonStr = text.trim();

    // Remove code block markers if present
    if (jsonStr.startsWith('```')) {
      const match = jsonStr.match(/^```(?:json)?\n([\s\S]*?)\n```/);
      if (match && match[1]) {
        jsonStr = match[1].trim();
      } else {
        // If we have code block markers but no match, try to extract JSON
        jsonStr = jsonStr.replace(/^```(?:json)?\n?|```$/g, '').trim();
      }
    }

    // Try to extract JSON object if response contains extra text
    if (!jsonStr.startsWith('{')) {
      const firstBrace = jsonStr.indexOf('{');
      const lastBrace = jsonStr.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
      }
    }

    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch (e) {
      console.error('Failed to parse AI response as JSON:', jsonStr);
      throw e; // or handle fallback
    }

    // Helper function to normalize the signal
    const normalizeSignal = (signal: any): Signal => {
      if (!signal) return 'hold';
      const s = String(signal).toLowerCase().trim();
      return s === 'buy' || s === 'sell' || s === 'hold' ? s : 'hold';
    };

    return {
      btc: normalizeSignal(result.BTC || result.btc || result.Btc),
      eth: normalizeSignal(result.ETH || result.eth || result.Eth),
      reason: result.reason || 'AI analysis based on technical indicators',
    };
  } catch (e) {
    console.error('AI error:', e);
    // Fallback to technical signals if AI fails
    const techBtc = getTechSignal([btc], 0);
    const techEth = getTechSignal([eth], 0);

    return {
      btc: techBtc,
      eth: techEth,
      reason:
        'Falling back to technical signals due to AI error: ' +
        (e instanceof Error ? e.message : 'Unknown error'),
    };
  }
}

// Enhanced backtest with detailed metrics
async function runBacktest() {
  console.log('🚀 Starting backtest with enhanced technical analysis...');

  // Load market data
  const btcData = loadData('./Backtesting/features_json/btc_features.csv');
  const ethData = loadData('./Backtesting/features_json/eth_features.csv');

  // Initialize portfolio
  const initialBalance = 30000;
  let usd = initialBalance;
  let btc = 0;
  let eth = 0;
  let peakValue = initialBalance;
  let maxDrawdown = 0;

  interface Trade {
    type: 'BUY' | 'SELL';
    asset: 'BTC' | 'ETH';
    price: number;
    amount: number;
    timestamp: string;
    reason?: string;
    status: 'open' | 'closed';
  }

  const trades: Trade[] = [];
  const minLen = Math.min(btcData.length, ethData.length);
  const startIndex = Math.max(50, minLen - 72);

  // Track performance metrics
  let winTrades = 0;
  let lossTrades = 0;
  let totalProfit = 0;
  let totalLoss = 0;

  console.log(
    `📊 Analyzing ${minLen - startIndex} intervals (~${Math.round(((minLen - startIndex) * 5) / 60)} hours) of market data...`
  );

  for (let i = startIndex; i < minLen; i++) {
    const btcDataPoint = btcData[i];
    const ethDataPoint = ethData[i];
    const btcPrice = btcDataPoint.close;
    const ethPrice = ethDataPoint.close;
    const timestamp = new Date(btcDataPoint.time).toISOString();

    // Get signals with historical data for LSTM
    const techBtc = getTechSignal(btcData, i);
    const techEth = getTechSignal(ethData, i);

    // Get previous 20 data points for LSTM (or as many as available)
    const btcHistory = btcData.slice(Math.max(0, i - 20), i);
    const ethHistory = ethData.slice(Math.max(0, i - 20), i);

    const aiSignal = await getAISignal(
      btcDataPoint,
      ethDataPoint,
      btcHistory,
      ethHistory
    );

    // Log signals for debugging
    console.log(
      `[${timestamp}] BTC AI signal:`,
      aiSignal.btc,
      'Tech:',
      techBtc
    );
    console.log(
      `[${timestamp}] ETH AI signal:`,
      aiSignal.eth,
      'Tech:',
      techEth
    );

    // Calculate portfolio metrics
    const btcValue = btc * btcPrice;
    const ethValue = eth * ethPrice;
    const portfolioValue = usd + btcValue + ethValue;
    peakValue = Math.max(peakValue, portfolioValue);
    const drawdown = ((peakValue - portfolioValue) / peakValue) * 100;
    maxDrawdown = Math.max(maxDrawdown, drawdown);

    // Execute trades with enhanced logic
    const executeTrade = (
      asset: 'BTC' | 'ETH',
      price: number,
      signal: Signal,
      techSig: Signal
    ) => {
      const positionSize = 0.1; // 10% of portfolio
      const assetAmount = asset === 'BTC' ? btc : eth;

      // Close position logic
      if (assetAmount > 0 && (signal === 'sell' || techSig === 'sell')) {
        const closeValue = assetAmount * price;
        const findLastTrade = (
          trades: Trade[],
          asset: string
        ): Trade | undefined => {
          for (let i = trades.length - 1; i >= 0; i--) {
            const trade = trades[i];
            if (
              trade.asset === asset &&
              trade.type === 'BUY' &&
              !trade.reason?.includes('closed')
            ) {
              return trade;
            }
          }
          return undefined;
        };

        const entryTrade = findLastTrade(trades, asset);

        if (entryTrade) {
          const profit = closeValue - entryTrade.amount * entryTrade.price;
          const isWin = profit > 0;
          if (isWin) {
            winTrades++;
            totalProfit += profit;
          } else {
            lossTrades++;
            totalLoss += Math.abs(profit);
          }

          // Mark as closed
          if (entryTrade) entryTrade.reason = 'closed';
        }

        usd += closeValue;
        if (asset === 'BTC') btc = 0;
        else eth = 0;

        trades.push({
          type: 'SELL',
          asset,
          price,
          amount: assetAmount,
          timestamp,
          status: 'closed' as const,
          reason: `Signal: ${signal}, Tech: ${techSig}`,
        });

        console.log(
          `[${timestamp}] CLOSED ${asset} position @ $${price.toFixed(2)}`
        );
      }
      // Open position logic (AI OR Tech)
      else if ((signal === 'buy' || techSig === 'buy') && usd > 100) {
        const amount = (usd * positionSize) / price;
        usd -= amount * price;
        if (asset === 'BTC') btc += amount;
        else eth += amount;

        trades.push({
          type: 'BUY',
          asset,
          price,
          amount,
          timestamp,
          status: 'open' as const,
          reason: `Signal: ${signal}, Tech: ${techSig}`,
        });

        console.log(
          `[${timestamp}] OPENED ${asset} position @ $${price.toFixed(2)}`
        );
      } else {
        // Log skipped trade
        console.log(
          `[${timestamp}] No trade for ${asset}. Reason: signal=${signal}, techSig=${techSig}, assetAmount=${assetAmount}, usd=${usd}`
        );
      }
    };

    // Execute trades for both assets
    executeTrade('BTC', btcPrice, aiSignal.btc, techBtc);
    executeTrade('ETH', ethPrice, aiSignal.eth, techEth);

    // Log progress every 12 intervals (1 hour)
    if ((i - startIndex) % 12 === 0) {
      const hoursElapsed = (i - startIndex) / 12;
      console.log(`\n⏱️  [${timestamp}] Hour ${hoursElapsed}/6`);
      console.log(
        `   Portfolio: $${portfolioValue.toFixed(2)} (${((portfolioValue / initialBalance - 1) * 100).toFixed(2)}%)`
      );
      console.log(`   Max Drawdown: ${maxDrawdown.toFixed(2)}%`);
      console.log(
        `   Active Trades: ${trades.filter((t) => !t.reason?.includes('closed')).length}`
      );
    }
  }

  // Close any remaining positions
  const finalBtcValue = btc * btcData[minLen - 1].close;
  const finalEthValue = eth * ethData[minLen - 1].close;
  usd += finalBtcValue + finalEthValue;

  // Calculate final metrics
  const finalPortfolio = usd;
  const totalReturn = (finalPortfolio / initialBalance - 1) * 100;
  const totalTrades = winTrades + lossTrades;
  const winRate = totalTrades > 0 ? (winTrades / totalTrades) * 100 : 0;
  const profitFactor =
    totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;

  // Generate final report
  console.log('\n📊 --- Backtest Results ---');
  console.log(`💰 Final Portfolio: $${finalPortfolio.toFixed(2)}`);
  console.log(`📈 Total Return: ${totalReturn.toFixed(2)}%`);
  console.log(`📉 Max Drawdown: ${maxDrawdown.toFixed(2)}%`);
  console.log(`🔄 Total Trades: ${winTrades + lossTrades}`);
  console.log(`✅ Win Rate: ${winRate.toFixed(1)}%`);
  console.log(`📊 Profit Factor: ${profitFactor.toFixed(2)}`);
  console.log(`🏦 Initial Balance: $${initialBalance.toFixed(2)}`);
  console.log(`💵 Final Balance: $${finalPortfolio.toFixed(2)}`);

  // Save detailed trades to file
  const result = {
    initialBalance,
    finalBalance: finalPortfolio,
    totalReturn,
    maxDrawdown,
    totalTrades: winTrades + lossTrades,
    winRate,
    profitFactor,
    trades,
    metrics: {
      winTrades,
      lossTrades,
      totalProfit,
      totalLoss,
      peakValue,
    },
  };

  fs.writeFileSync('backtest_results.json', JSON.stringify(result, null, 2));
  console.log('\n💾 Detailed results saved to backtest_results.json');
}

// Run the backtest
runBacktest().catch(console.error);
