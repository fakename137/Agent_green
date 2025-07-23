import { createWorkflow } from '@mastra/core/workflows';
import {
  memesolTrendingTool,
  memesolDexScreenerTool,
} from '../tools/memesol-trending-tool';
import { trendingMemecoinsTool } from '../tools/memesol-santiment-tool';
import { memesolRugCheckTool } from '../tools/memesol-rugcheck-tool';

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { RuntimeContext } from '@mastra/core/di';
import { z } from 'zod';

const gaiaProvider = createOpenAICompatible({
  name: 'llama-3-groq-8b-tool',
  baseURL: 'https://0x45a6c94e707bbde5ab5a9aa737b73bec2eeb67f5.gaia.domains/v1',
  apiKey: 'not-needed',
});

// 1. Create the mastra instance and register it globally

const runtimeContext = new RuntimeContext();

// Trading Configuration
const TRADING_CONFIG = {
  BASE_CURRENCY: 'So11111111111111111111111111111111111111112', // SOL
  PROFIT_MULTIPLIER: 1.5, // Take profit at 1.5x
  SLIPPAGE_BUY: '1', // 1% slippage for buying
  SLIPPAGE_SELL: '2', // 2% slippage for selling (higher due to memecoin volatility)
  INVESTMENT_AMOUNTS: {
    LOW_RISK: 300, // $300 for low risk tokens
    MODERATE_RISK: 150, // $150 for moderate risk tokens
    HIGH_RISK: 100, // $100 for high risk tokens
  },
};

const outputSchema = z.object({
  tokens: z.array(
    z.object({
      address: z.string(),
      data: z.any(),
      score: z.number(),
      category: z.string(),
      errors: z.array(z.string()).optional(),
    })
  ),
  summary: z.string(),
  dryRun: z.boolean().optional(),
});

export const memesolWorkflow = createWorkflow({
  id: 'memesol-autonomous',
  description:
    'Fully autonomous workflow for discovering, analyzing, and shortlisting Solana memecoins using multi-source data aggregation and LLM scoring.',
  inputSchema: z.object({}),
  outputSchema,
})
  // Step 1: Fetch trending tokens and return as array
  .then({
    id: 'fetch-trending-tokens',
    inputSchema: z.object({}),
    outputSchema: z.array(z.any()),
    execute: async () => {
      console.log('[MemesolWorkflow] [Step: fetch-trending-tokens] START');
      const [rugCheckRes, dexScreenerRes, sqlRes] = await Promise.all([
        memesolTrendingTool.execute({ runtimeContext, context: {} }),
        memesolDexScreenerTool.execute({ runtimeContext, context: {} }),
        trendingMemecoinsTool.execute({
          runtimeContext,
          context: { platform: 'dexscreener', days: 6 },
        }),
      ]);

      // Limit to 10 from each source
      const allTokens = [
        ...(rugCheckRes.tokens ? rugCheckRes.tokens.slice(0, 10) : []),
        ...(dexScreenerRes.tokens ? dexScreenerRes.tokens.slice(0, 5) : []),
        ...(sqlRes.memecoins ? sqlRes.memecoins.slice(0, 10) : []),
      ];
      const tokenMap = new Map();
      for (const token of allTokens) {
        // Always extract address from tokenAddress, inputData.tokenAddress, asset_ref_id, or address
        const address =
          token.tokenAddress ||
          (token.inputData && token.inputData.tokenAddress) ||
          token.asset_ref_id ||
          token.address;
        if (address && !tokenMap.has(address)) {
          tokenMap.set(address, token);
        }
      }
      // Only process the first 20 unique tokens
      const uniqueTokens = Array.from(tokenMap.values()).slice(0, 20);
      console.log(
        `[MemesolWorkflow] [Step: fetch-trending-tokens] Found ${uniqueTokens.length} unique tokens.`
      );
      console.log(
        '[MemesolWorkflow] [Step: fetch-trending-tokens] END',
        uniqueTokens
      );
      return uniqueTokens;
    },
  })
  // Step 2: For each token, fetch all details in parallel
  .foreach({
    id: 'fetch-token-details',
    inputSchema: z.any(),
    outputSchema: z.object({
      address: z.string(),
      data: z.any(),
      errors: z.array(z.string()).optional(),
    }),
    execute: async (token: any) => {
      // Fix: Access the actual token data from inputData
      const tokenData = token.inputData || token;

      // Extract address from the token data
      let address =
        tokenData.tokenAddress || tokenData.asset_ref_id || tokenData.address;
      address = String(address || 'unknown');
      const errors: string[] = [];

      if (
        !tokenData.tokenAddress &&
        !tokenData.asset_ref_id &&
        !tokenData.address
      ) {
        errors.push('Missing address');
        console.log(
          '[MemesolWorkflow] [Step: fetch-token-details] SKIP: Token missing address:',
          tokenData
        );
        return { address, data: {}, errors };
      }
      console.log(
        `[MemesolWorkflow] [Step: fetch-token-details] START for token: ${address}`
      );

      // Use tokenData.tokenAddress for rug check if present
      const rugCheckAddress = tokenData.tokenAddress || address;
      // Fetch rug check first to get the symbol from tokenMeta
      const rug = await memesolRugCheckTool
        .execute({ runtimeContext, context: { address: rugCheckAddress } })
        .catch((e) => {
          errors.push('RugCheck failed');
          return null;
        });

      // Checklist-based scoring and logging system for RugCheck response
      if (rug?.rugCheck) {
        const rc = rug.rugCheck;
        let score = 0;
        let logs = [];
        // 1. MINT & FREEZE AUTHORITY
        const mintAuthGood = rc.token?.mintAuthority == null;
        const freezeAuthGood = rc.token?.freezeAuthority == null;
        logs.push({
          check: 'Mint Authority',
          value: rc.token?.mintAuthority,
          result: mintAuthGood,
        });
        logs.push({
          check: 'Freeze Authority',
          value: rc.token?.freezeAuthority,
          result: freezeAuthGood,
        });
        if (mintAuthGood) score += 10;
        else score -= 20;
        if (freezeAuthGood) score += 10;
        else score -= 20;
        // 2. LOCKED LIQUIDITY
        const lp = rc.lp || {};
        const lpLockedPct = lp.lpLockedPct || 0;
        const lpLockedUSD = lp.lpLockedUSD || 0;
        const lpUnlocked = lp.lpUnlocked || 0;
        const lockers = rc.lockers || {};
        const hasLocker = Object.keys(lockers).length > 0;
        logs.push({
          check: 'LP Locked %',
          value: lpLockedPct,
          result: lpLockedPct >= 90,
        });
        logs.push({
          check: 'LP Locked USD',
          value: lpLockedUSD,
          result: lpLockedUSD >= 2000,
        });
        logs.push({
          check: 'LP Unlocked',
          value: lpUnlocked,
          result: lpUnlocked === 0,
        });
        logs.push({ check: 'Has Locker', value: hasLocker, result: hasLocker });
        if (lpLockedPct >= 90) score += 10;
        else score -= 10;
        if (lpLockedUSD >= 2000) score += 5;
        else score -= 5;
        if (lpUnlocked === 0) score += 5;
        else score -= 10;
        if (hasLocker) score += 5;
        else score -= 10;
        // 3. MARKET & PRICE HEALTH
        const totalMarketLiquidity = rc.totalMarketLiquidity || 0;
        const price = rc.price || 0;
        logs.push({
          check: 'Total Market Liquidity',
          value: totalMarketLiquidity,
          result: totalMarketLiquidity >= 10000,
        });
        logs.push({ check: 'Price', value: price, result: price > 0 });
        if (totalMarketLiquidity >= 10000) score += 10;
        else score -= 10;
        if (price > 0) score += 5;
        else score -= 10;
        // 4. INSIDER RISKS
        const topHolders: Array<{ pct?: number; insider?: boolean }> =
          rc.topHolders || [];
        const top10Pct = topHolders
          .slice(0, 10)
          .reduce((sum: number, h: { pct?: number }) => sum + (h.pct || 0), 0);
        const anyHolder10 = topHolders.some(
          (h: { pct?: number }) => (h.pct || 0) >= 10
        );
        const anyInsider = topHolders.some(
          (h: { insider?: boolean }) => h.insider === true
        );
        logs.push({
          check: 'Top 10 Holders %',
          value: top10Pct,
          result: top10Pct <= 25,
        });
        logs.push({
          check: 'Any Holder >=10%',
          value: anyHolder10,
          result: !anyHolder10,
        });
        logs.push({
          check: 'Any Insider',
          value: anyInsider,
          result: !anyInsider,
        });
        if (top10Pct <= 25) score += 10;
        else score -= 10;
        if (!anyHolder10) score += 5;
        else score -= 10;
        if (!anyInsider) score += 5;
        else score -= 20;
        // 5. CREATOR RISK
        const creatorBalance = rc.creatorBalance || 0;
        const creatorTokens = rc.creatorTokens || [];
        logs.push({
          check: 'Creator Balance',
          value: creatorBalance,
          result: creatorBalance === 0,
        });
        logs.push({
          check: 'Creator Tokens',
          value: creatorTokens.length,
          result: creatorTokens.length < 3,
        });
        if (creatorBalance === 0) score += 5;
        else score -= 10;
        if (creatorTokens.length < 3) score += 5;
        else score -= 10;
        // 6. RUG HISTORY & SCORE
        const scoreNorm = rc.score_normalised || 0;
        const rugged = rc.rugged === true;
        logs.push({
          check: 'Score Normalised',
          value: scoreNorm,
          result: scoreNorm >= 85,
        });
        logs.push({ check: 'Rugged', value: rugged, result: !rugged });
        if (scoreNorm >= 85) score += 10;
        else if (scoreNorm < 70) score -= 20;
        if (!rugged) score += 10;
        else score -= 50;
        // 7. TOKEN METADATA
        const mutable = rc.tokenMeta?.mutable;
        logs.push({
          check: 'Token Metadata Mutable',
          value: mutable,
          result: mutable === false,
        });
        if (mutable === false) score += 5;
        else score -= 5;
        // 8. TRANSFER FEES
        const transferFeePct = rc.transferFee?.pct || 0;
        logs.push({
          check: 'Transfer Fee %',
          value: transferFeePct,
          result: transferFeePct <= 6,
        });
        if (transferFeePct <= 6) score += 5;
        else if (transferFeePct > 10) score -= 20;
        // 9. VERIFICATION FLAGS
        const jupVerified = rc.verification?.jup_verified;
        const jupStrict = rc.verification?.jup_strict;
        logs.push({
          check: 'Jupiter Verified',
          value: jupVerified,
          result: jupVerified === true,
        });
        logs.push({
          check: 'Jupiter Strict',
          value: jupStrict,
          result: jupStrict === true,
        });
        if (jupVerified) score += 5;
        if (jupStrict) score += 5;
        // 10. ADDITIONAL ADVANCED METRICS
        const totalHolders = rc.totalHolders || 0;
        const totalLPProviders = rc.totalLPProviders || 0;
        logs.push({
          check: 'Total Holders',
          value: totalHolders,
          result: totalHolders >= 100,
        });
        logs.push({
          check: 'Total LP Providers',
          value: totalLPProviders,
          result: totalLPProviders >= 20,
        });
        if (totalHolders >= 100) score += 5;
        else score -= 5;
        if (totalLPProviders >= 20) score += 5;
        else score -= 5;
        // Print all logs and final score
        console.log(
          '[MemesolWorkflow] [RugCheck Checklist]',
          JSON.stringify(logs, null, 2)
        );
        const verdict = score >= 40 ? 'SAFE' : 'RISKY';
        console.log(
          `[MemesolWorkflow] [RugCheck Verdict] Score: ${score} Verdict: ${verdict}`
        );
        // Attach checklist results to rugCheck for LLM prompt
        rug.rugCheck.checklist = { score, verdict, logs };
      }
      // Extract symbol from rugCheck response if available
      let symbol = rug?.rugCheck?.tokenMeta?.symbol;

      console.log(
        `[MemesolWorkflow] [Step: fetch-token-details] Symbol: ${symbol}`
      );
      // Comment out Birdeye
      // const birdeye = await memesolBirdeyeTool.execute({ runtimeContext, context: { symbol } }).catch(e => { errors.push('Birdeye failed'); return null; });
      // Social media analysis
      // const reddit = await memesolRedditTool
      //   .execute({ runtimeContext, context: { symbol } })
      //   .catch((e) => {
      //     errors.push('Reddit failed');
      //     return null;
      //   });

      // // Advanced social sentiment analysis (with error handling)
      // let telegram = null;
      // try {
      //   telegram = await telegramSentimentTool.execute({
      //     runtimeContext,
      //     context: { tokenSymbol: symbol },
      //   });
      // } catch (e) {
      //   errors.push('Telegram analysis failed');
      // }

      // let discord = null;
      // try {
      //   discord = await discordMonitorTool.execute({
      //     runtimeContext,
      //     context: { tokenSymbol: symbol },
      //   });
      // } catch (e) {
      //   errors.push('Discord monitoring failed');
      // }

      // let videoTrends = null;
      // try {
      //   videoTrends = await videoTrendsTool.execute({
      //     runtimeContext,
      //     context: { tokenSymbol: symbol, timeframe: '24h' as const },
      //   });
      // } catch (e) {
      //   errors.push('Video trends analysis failed');
      // }

      // let influencerMentions = null;
      // try {
      //   influencerMentions = await influencerTrackerTool.execute({
      //     runtimeContext,
      //     context: {
      //       tokenSymbol: symbol,
      //       timeframe: '24h' as const,
      //       platforms: ['twitter' as const],
      //     },
      //   });
      // } catch (e) {
      //   errors.push('Influencer tracking failed');
      // }

      // // Twitter: mock response (can be enhanced with real API)
      // const twitter = {
      //   twitter: { sentiment: 0.5, mentions: 0 },
      //   error: 'Mocked response',
      // };

      //     const data = {
      //       rug,
      //       reddit,
      //       twitter,
      //       telegram,
      //       discord,
      //       videoTrends,
      //       influencerMentions,
      //     };
      //     console.log(
      //       `[MemesolWorkflow] [Step: fetch-token-details] END for token: ${symbol} (${address})`,
      //       data,
      //       errors
      //     );
      return { address, errors };
    },
  })
  .then({
    id: 'score-and-aggregate',
    inputSchema: z.array(
      z.object({
        address: z.string(),
        data: z.any(),
        errors: z.array(z.string()).optional(),
      })
    ),
    outputSchema,
    execute: async ({ inputData }) => {
      const tokensArr = inputData;
      console.log(
        `[MemesolWorkflow] [Step: score-and-aggregate] START for ${tokensArr.length} tokens`
      );
      const mastra = (global as any).mastra;
      const agent = mastra?.getAgent('memesolAgent');
      const filterPrompt = `MEMECOIN IDENTIFICATION FILTERS\n\nincludeScams: false\npotentialScam: false\nisTestnet: false\nmintable: false\nfreezable: false\nlaunchpadCompleted: true\nisVerified: true\ntrendingIgnored: false\nmarketCap: { gt: 100000 }\nliquidity: { gt: 5000 }\ncreatedAt: { gt: CURRENT_TIMESTAMP - 12 * 60 * 60 }\nlaunchpadCompletedAt: { gt: CURRENT_TIMESTAMP - 12 * 60 * 60 }\nbuyCount5m: { gt: 10 }\nuniqueBuys5m: { gt: 8 }\nbuyCount1: { gt: 50 }\nuniqueBuys1: { gt: 30 }\ntxnCount1: { gt: 60 }\nvolume1: { gt: 20000 }\nvolumeChange1: { gt: 0.2 }\nchange1: { gt: 0.05 }\nsellCount1: { lt: buyCount1 }\nuniqueSells1: { lt: uniqueBuys1 }\nwalletAgeAvg: { gt: 3 }\nswapPct1dOldWallet: { lt: 0.5 }\nnetwork: [103]\nlaunchpadProtocol: 'Pump.fun'\nlaunchpadName: 'Pump.fun'\nhigh1: { gt: low1 }\npriceUSD: { gt: 0.000001 }\nholders: { gt: 100 }\nvolumeChange5m: { gt: 0.25 }\nchange5m: { gt: 0.02 }\nvolume5m: { gt: 2000 }\nbuyVolume5m: { gt: 1500 }\nuniqueTransactions5m: { gt: 10 }\nchange1: { lt: -0.05 }\nsellCount1: { gt: buyCount1 }\nvolumeChange1: { lt: -0.15 }\ngraphInsidersDetected: 0\ninsiderNetworks: []\nfileMeta: { name: string, symbol: string, image: string, ... }\nevents: []\nlockerOwners: {}\n\nRISK ANALYSIS FRAMEWORK\n| Metric                 | Ideal              | Moderate           | Danger            | Where to Check         |\n|------------------------|--------------------|--------------------|-------------------|------------------------|\n| Liquidity              | >$100k             | $10k–100k          | <$10k             | DEXScreener, Birdeye   |\n| RugChecker Safety      | 90–100%            | 70–90%             | <70%              | RugChecker, Solsniffer |\n| Reddit Social          | Real discussion    | Some discussion    | Only spam/shill   | Reddit, X, Telegram    |\n| Top Holder %           | None >3%           | <10% high          | >20% whales       | BirdEye, Solscan       |\n| 1h Transaction Count   | >200               | 50–200             | <50               | DEX Screener           |\n| Buy/Sell (1h)          | Buys > Sells       | Even               | Sells > Buys      | DEXScreener, BirdEye   |\n| Volume (1h)            | >$100k             | $20k–100k          | <$20k             | DEXScreener, BirdEye   |\n| Social Warnings        | None               | Some warnings      | Multiple          | Reddit Top, RugCheck   |`;

      const scoredTokens = await Promise.all(
        tokensArr.map(async (token) => {
          let score = 25;
          let category = 'Unknown';
          let status = 'passed';
          let reason = '';
          if (token.errors && token.errors.length > 0) {
            status = 'failed';
            reason = token.errors.join('; ');
            console.log(
              `[score-and-aggregate] Fallback scoring used for token ${token.address} due to errors:`,
              reason
            );
            fallbackScoredCount++;
          } else if (agent && status === 'passed') {
            try {
              // If checklist exists, include it in the LLM prompt
              let checklistSummary = '';
              const checklist = token.data?.rug?.rugCheck?.checklist;
              if (checklist) {
                checklistSummary = `\n\nRugCheck Checklist Results:\nScore: ${checklist.score}\nVerdict: ${checklist.verdict}\nDetails: ${JSON.stringify(checklist.logs, null, 2)}`;
              }
              // Enhanced prompt with social sentiment analysis
              let socialSummary = '';
              if (token.data.telegram?.success) {
                socialSummary += `\nTelegram: ${token.data.telegram.data.messages.sentimentScore.toFixed(2)} sentiment, ${token.data.telegram.data.groupInfo.memberCount} members`;
              }
              if (token.data.discord?.success) {
                socialSummary += `\nDiscord: ${token.data.discord.data.overallScore.toFixed(0)} community score, ${token.data.discord.data.serverInfo.memberCount} members`;
              }
              if (token.data.videoTrends?.success) {
                socialSummary += `\nVideo Trends: ${token.data.videoTrends.data.overall.viralityIndex.toFixed(0)} virality index, ${token.data.videoTrends.data.overall.momentumScore.toFixed(0)} momentum`;
              }
              if (token.data.influencerMentions?.success) {
                socialSummary += `\nInfluencer: ${token.data.influencerMentions.data.recent_mentions.length} mentions, ${token.data.influencerMentions.data.aggregate_sentiment.toFixed(2)} sentiment`;
              }

              const prompt = `${filterPrompt}${checklistSummary}${socialSummary}\n\nAnalyze the following Solana memecoin data including advanced social sentiment analysis and provide a score (0-100) and a risk category (Low, Moderate, High):\n${JSON.stringify(token.data, null, 2)}`;
              const response = await agent.generate(prompt);
              console.log(
                `[score-and-aggregate] Full LLM response for token ${token.address}:`,
                response
              );
              if (!response || typeof response.text !== 'string') {
                console.error(
                  `[score-and-aggregate] LLM response is undefined or missing text for token ${token.address}:`,
                  response
                );
                status = 'failed';
                reason = 'LLM response undefined or missing text';
                fallbackScoredCount++;
                return {
                  ...token,
                  score: 0,
                  category: 'Unknown',
                  status,
                  reason,
                };
              }
              // Log the raw LLM response text
              console.log(
                `[score-and-aggregate] Raw LLM response for token ${token.address}:`,
                response.text
              );
              const match = response.text?.match(/score\s*[:=\-]?\s*(\d+)/i);
              score = match ? parseInt(match[1], 10) : 0;
              const catMatch = response.text?.match(
                /category\s*[:=\-]?\s*([a-z]+)/i
              );
              if (catMatch && catMatch[1]) {
                category = catMatch[1].trim();
              } else {
                category = 'Unknown';
                console.warn(
                  `[score-and-aggregate] Could not extract category for token ${token.address} from LLM response.`
                );
              }
              // Log extracted values
              console.log(
                `[score-and-aggregate] Extracted score: ${score}, category: ${category} for token ${token.address}`
              );
              llmScoredCount++;
            } catch (e) {
              status = 'failed';
              reason = (e as Error).message;
              console.error(
                `[score-and-aggregate] LLM scoring failed for token ${token.address}:`,
                e
              );
              fallbackScoredCount++;
            }
          } else {
            // This block should not be reached due to the throw above, but log just in case
            console.log(
              `[score-and-aggregate] Fallback scoring used for token ${token.address} (agent missing or status not passed)`
            );
            fallbackScoredCount++;
          }
          return {
            ...token,
            score,
            category,
            status,
            reason,
          };
        })
      );

      const passed = scoredTokens.filter((t) => t.status === 'passed');
      const failed = scoredTokens.filter((t) => t.status === 'failed');
      let summary = `Analyzed ${scoredTokens.length} tokens.\nPassed: ${passed.length}, Failed: ${failed.length}`;
      if (failed.length > 0) {
        summary += '\nSome tokens failed filters or scoring. See details.';
      }
      console.log(
        `[score-and-aggregate] LLM scored: ${llmScoredCount}, fallback/default scored: ${fallbackScoredCount}`
      );
      console.log('[MemesolWorkflow] [Step: score-and-aggregate] END', {
        tokens: scoredTokens,
        summary,
      });
      return {
        tokens: scoredTokens,
        summary,
      };
    },
  })
  .then({
    id: 'complex-risk-trading',
    inputSchema: outputSchema,
    outputSchema: z.any(),
    execute: async ({ inputData, runtimeContext }) => {
      const {
        recallTrade,
        recallTradeQuote,
        recallAgentBalances,
        formatRecallTradeResponse,
        formatRecallAgentBalancesResponse,
      } = await import('../tools/recall-trade');
      console.log('[complex-risk-trading] START');
      console.log(
        `[complex-risk-trading] Input tokens: ${inputData.tokens.length}`
      );

      // Debug: Check all tokens before filtering
      inputData.tokens.forEach((t: any, i: number) => {
        const verdict = t.data?.rug?.rugCheck?.checklist?.verdict;
        const score = t.data?.rug?.rugCheck?.checklist?.score || 0;
        const hasErrors = t.errors && t.errors.length > 0;
        console.log(
          `[Token ${i + 1}] ${t.address}: verdict="${verdict}", score=${score}, hasErrors=${hasErrors}, errors=${JSON.stringify(t.errors || [])}`
        );
      });

      // 1. Get tokens that passed basic filters (expand criteria)
      const safeTokens = inputData.tokens.filter((t: any) => {
        const verdict = t.data?.rug?.rugCheck?.checklist?.verdict;
        const hasErrors = t.errors && t.errors.length > 0;
        const score = t.data?.rug?.rugCheck?.checklist?.score || 0;
        // Accept SAFE tokens OR tokens with score >= 20 (lowered threshold)
        const passes = !hasErrors && (verdict === 'SAFE' || score >= 20);
        if (!passes) {
          console.log(
            `[FILTERED OUT] ${t.address}: hasErrors=${hasErrors}, verdict="${verdict}", score=${score}`
          );
        }
        return passes;
      });
      // Debug log for SAFE token details
      console.log(
        '[complex-risk-trading] SAFE token details:',
        safeTokens.map((t) => ({
          address: t.address,
          category: t.category,
          checklistCategory: t.data?.rug?.rugCheck?.checklist?.category,
        }))
      );
      // Use score-based risk categorization (more flexible)
      function categorizeByScore(token: any) {
        const score =
          token.score || token.data?.rug?.rugCheck?.checklist?.score || 0;
        const category = token.category || '';

        console.log(
          `[categorizeByScore] Token ${token.address}: score=${score}, category="${category}"`
        );

        // Score-based categorization (adjusted thresholds)
        if (score >= 60) {
          console.log(
            `[categorizeByScore] ${token.address} -> 'low' (score >= 60)`
          );
          return 'low';
        }
        if (score >= 40) {
          console.log(
            `[categorizeByScore] ${token.address} -> 'moderate' (score >= 40)`
          );
          return 'moderate';
        }
        if (score >= 20) {
          console.log(
            `[categorizeByScore] ${token.address} -> 'high' (score >= 20)`
          );
          return 'high';
        }

        // Fallback to LLM category (flexible matching)
        const cat = category.toLowerCase();
        if (
          cat.includes('low') ||
          cat.includes('safe') ||
          cat.includes('easy')
        ) {
          console.log(
            `[categorizeByScore] ${token.address} -> 'low' (category match: "${cat}")`
          );
          return 'low';
        }
        if (cat.includes('moderate') || cat.includes('medium')) {
          console.log(
            `[categorizeByScore] ${token.address} -> 'moderate' (category match: "${cat}")`
          );
          return 'moderate';
        }
        if (
          cat.includes('high') ||
          cat.includes('risky') ||
          cat.includes('danger')
        ) {
          console.log(
            `[categorizeByScore] ${token.address} -> 'high' (category match: "${cat}")`
          );
          return 'high';
        }

        // Default fallback - distribute evenly
        console.log(
          `[categorizeByScore] ${token.address} -> 'moderate' (default fallback)`
        );
        return 'moderate';
      }

      const lowRisk = safeTokens
        .filter((t: any) => categorizeByScore(t) === 'low')
        .slice(0, 3);
      const medRisk = safeTokens
        .filter((t: any) => categorizeByScore(t) === 'moderate')
        .slice(0, 3);
      const highRisk = safeTokens
        .filter((t: any) => categorizeByScore(t) === 'high')
        .slice(0, 3);

      // If still no tokens, use any available tokens
      if (
        lowRisk.length === 0 &&
        medRisk.length === 0 &&
        highRisk.length === 0 &&
        safeTokens.length > 0
      ) {
        console.log(
          '[complex-risk-trading] No categorized tokens found, distributing available tokens evenly'
        );
        const available = [...safeTokens];
        for (let i = 0; i < Math.min(3, available.length); i++) {
          if (i % 3 === 0) lowRisk.push(available[i]);
          else if (i % 3 === 1) medRisk.push(available[i]);
          else highRisk.push(available[i]);
        }
      }
      console.log(`[complex-risk-trading] Low risk tokens: ${lowRisk.length}`);
      console.log(
        `[complex-risk-trading] Moderate risk tokens: ${medRisk.length}`
      );
      console.log(
        `[complex-risk-trading] High risk tokens: ${highRisk.length}`
      );
      const investPlan = [
        { tokens: lowRisk, amount: TRADING_CONFIG.INVESTMENT_AMOUNTS.LOW_RISK },
        {
          tokens: medRisk,
          amount: TRADING_CONFIG.INVESTMENT_AMOUNTS.MODERATE_RISK,
        },
        {
          tokens: highRisk,
          amount: TRADING_CONFIG.INVESTMENT_AMOUNTS.HIGH_RISK,
        },
      ];
      const tradeLogs = [];

      // Skip trading if no tokens available
      if (
        lowRisk.length === 0 &&
        medRisk.length === 0 &&
        highRisk.length === 0
      ) {
        console.log(
          '[complex-risk-trading] No viable tokens for trading, skipping trade execution'
        );
        return {
          message: 'No viable tokens found for trading after filtering',
          tokensAnalyzed: inputData.tokens.length,
          safeTokens: safeTokens.length,
          tradeLogs: [],
          dryRun: true,
        };
      }

      // Check if Recall API is configured for production trading
      if (!process.env.RECALL_API_URL || !process.env.RECALL_API_KEY) {
        console.log(
          '[complex-risk-trading] Recall API not configured, analysis only mode'
        );
        return {
          message:
            'Analysis completed. Set RECALL_API_URL and RECALL_API_KEY for live trading.',
          tokensAnalyzed: inputData.tokens.length,
          safeTokens: safeTokens.length,
          lowRiskTokens: lowRisk.length,
          moderateRiskTokens: medRisk.length,
          highRiskTokens: highRisk.length,
          tradeLogs: [
            {
              note: 'API Configuration Required',
              details:
                'Set RECALL_API_URL=https://api.sandbox.competitions.recall.network and RECALL_API_KEY=your_key',
            },
          ],
          dryRun: true,
        };
      }

      for (const { tokens, amount } of investPlan) {
        for (const token of tokens) {
          // Trading Logic: Always SOL -> Memecoin (buying)
          const fromToken = TRADING_CONFIG.BASE_CURRENCY; // SOL
          const toToken = token.address; // Target memecoin
          const tradeAmount = amount.toString();
          const reason = `BUY: ${amount} USD worth of ${token.data?.rug?.rugCheck?.tokenMeta?.symbol || token.address} (Score: ${token.score})`;
          let quote, balanceBefore, tradeResult, balanceAfter;
          try {
            console.log(
              `[complex-risk-trading] Getting quote for ${fromToken} -> ${toToken}, amount: ${tradeAmount}`
            );
            quote = await recallTradeQuote.execute({
              runtimeContext,
              context: { fromToken, toToken, amount: tradeAmount },
            });
            const quoteSummary =
              quote && quote.exchangeRate
                ? `Quote: ${quote.fromAmount} ${quote.symbols?.fromTokenSymbol || fromToken} → ${quote.toAmount} ${quote.symbols?.toTokenSymbol || toToken} (Rate: ${quote.exchangeRate})`
                : JSON.stringify(quote);
            console.log(
              `[complex-risk-trading] Quote for ${toToken}:`,
              quoteSummary
            );
            balanceBefore = await recallAgentBalances.execute({
              runtimeContext,
              context: {},
            });
            const balanceBeforeSummary =
              formatRecallAgentBalancesResponse(balanceBefore).humanSummary;
            console.log(
              `[complex-risk-trading] Balance before trade for ${toToken}:`,
              balanceBeforeSummary
            );
            tradeResult = await recallTrade.execute({
              runtimeContext,
              context: {
                fromToken,
                toToken,
                amount: tradeAmount,
                reason,
                slippageTolerance: TRADING_CONFIG.SLIPPAGE_BUY,
              },
            });
            const tradeSummary =
              formatRecallTradeResponse(tradeResult).humanSummary;
            console.log(
              `[complex-risk-trading] Trade executed for ${toToken}:`,
              tradeSummary
            );
            balanceAfter = await recallAgentBalances.execute({
              runtimeContext,
              context: {},
            });
            const balanceAfterSummary =
              formatRecallAgentBalancesResponse(balanceAfter).humanSummary;
            console.log(
              `[complex-risk-trading] Balance after trade for ${toToken}:`,
              balanceAfterSummary
            );
            tradeLogs.push({
              token: token.address,
              risk:
                token.category ||
                token.data?.rug?.rugCheck?.checklist?.category,
              invest: amount,
              quote: quoteSummary,
              balanceBefore: balanceBeforeSummary,
              trade: tradeSummary,
              balanceAfter: balanceAfterSummary,
            });
            console.log(
              `[complex-risk-trading] Trade log for ${token.address}:`,
              {
                risk:
                  token.category ||
                  token.data?.rug?.rugCheck?.checklist?.category,
                invest: amount,
                quote: quoteSummary,
                balanceBefore: balanceBeforeSummary,
                trade: tradeSummary,
                balanceAfter: balanceAfterSummary,
              }
            );
          } catch (e: any) {
            tradeLogs.push({ token: token.address, error: e.message });
            console.error(
              `[complex-risk-trading] Trade failed for ${token.address}:`,
              e
            );
          }
        }
      }
      // PROFIT-TAKING LOGIC: Check portfolio and sell memecoins back to SOL when profitable
      try {
        console.log(
          '[complex-risk-trading] Checking portfolio for profit-taking opportunities...'
        );

        const finalPortfolio = await recallAgentBalances.execute({
          runtimeContext,
          context: {},
        });

        const profitTakingLogs = [];
        const solAddress = TRADING_CONFIG.BASE_CURRENCY;

        // Check each memecoin balance for profit opportunities
        for (const balance of finalPortfolio.balances || []) {
          if (balance.tokenAddress !== solAddress && balance.amount > 0) {
            try {
              // Get current price quote for Memecoin -> SOL
              const sellQuote = await recallTradeQuote.execute({
                runtimeContext,
                context: {
                  fromToken: balance.tokenAddress, // Memecoin
                  toToken: solAddress, // SOL
                  amount: balance.amount.toString(),
                },
              });

              // Simple profit-taking rule: Sell if we can get 1.5x+ value in SOL
              const profitMultiplier = TRADING_CONFIG.PROFIT_MULTIPLIER;
              const expectedMinSOL = 100 * profitMultiplier; // Assuming $100 initial investment

              if (sellQuote.toAmount >= expectedMinSOL) {
                console.log(
                  `[profit-taking] 💰 PROFIT OPPORTUNITY: ${balance.symbol} -> SOL (${sellQuote.toAmount} SOL >= ${expectedMinSOL})`
                );

                const sellResult = await recallTrade.execute({
                  runtimeContext,
                  context: {
                    fromToken: balance.tokenAddress, // Memecoin
                    toToken: solAddress, // SOL
                    amount: balance.amount.toString(),
                    reason: `SELL: Take profit on ${balance.symbol} at ${profitMultiplier}x`,
                    slippageTolerance: TRADING_CONFIG.SLIPPAGE_SELL, // Higher slippage tolerance for profit-taking
                  },
                });

                profitTakingLogs.push({
                  action: 'PROFIT_TAKEN',
                  token: balance.tokenAddress,
                  symbol: balance.symbol,
                  soldAmount: balance.amount,
                  receivedSOL: sellQuote.toAmount,
                  profitMultiplier: sellQuote.toAmount / 100, // Assuming $100 initial
                  trade: formatRecallTradeResponse(sellResult).humanSummary,
                });

                console.log(
                  `[profit-taking] ✅ SOLD: ${balance.amount} ${balance.symbol} -> ${sellQuote.toAmount} SOL`
                );
              } else {
                console.log(
                  `[profit-taking] 📈 HOLDING: ${balance.symbol} (${sellQuote.toAmount} SOL < ${expectedMinSOL} target)`
                );
                profitTakingLogs.push({
                  action: 'HOLDING',
                  token: balance.tokenAddress,
                  symbol: balance.symbol,
                  currentValue: sellQuote.toAmount,
                  targetValue: expectedMinSOL,
                  note: 'Waiting for better profit opportunity',
                });
              }
            } catch (error) {
              console.error(
                `[profit-taking] Failed to check ${balance.symbol}:`,
                error
              );
              profitTakingLogs.push({
                action: 'ERROR',
                token: balance.tokenAddress,
                symbol: balance.symbol,
                error: error instanceof Error ? error.message : 'Unknown error',
              });
            }
          }
        }

        tradeLogs.push({
          note: 'Profit-taking completed',
          profitTakingLogs,
          strategy: 'SOL -> Memecoin (buy) | Memecoin -> SOL (sell at 1.5x+)',
        });
      } catch (error) {
        console.error('[complex-risk-trading] Profit-taking failed:', error);
        tradeLogs.push({
          note: 'Profit-taking failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      console.log('[complex-risk-trading] END, tradeLogs:', tradeLogs);
      return { tradeLogs };
    },
  })
  .commit();
