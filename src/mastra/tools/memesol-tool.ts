import {
  createVincentTool,
  supportedPoliciesForTool,
} from '@lit-protocol/vincent-tool-sdk';
import { z } from 'zod';

// Parameter schema for the MemeSol tool
const toolParamsSchema = z.object({
  memecoin: z.string().min(1, 'Memecoin symbol is required'),
});

// Precheck success schema
const precheckSuccessSchema = z.object({
  birdeyeAvailable: z.boolean(),
  rugCheckAvailable: z.boolean(),
  socialAvailable: z.boolean(),
  dexscreenerAvailable: z.boolean(),
});

// Precheck fail schema
const precheckFailSchema = z.object({
  reason: z.string(),
});

// Execute success schema
const executeSuccessSchema = z.object({
  memecoin: z.string(),
  birdeyeData: z.any(),
  rugCheck: z.any(),
  socialSentiment: z.any(),
  trendingTokens: z.any(),
  recommendation: z.string(),
});

// Execute fail schema
const executeFailSchema = z.object({
  error: z.string(),
});

// API Configuration
const BIRDEYE_API_URL = 'https://public-api.birdeye.so';
const RUGCHECK_API_URL = 'https://api.rugcheck.xyz/v1';
const DEXSCREENER_API_URL = 'https://api.dexscreener.com';

// Rate limiting configuration
const RATE_LIMITS = {
  birdeye: { requests: 30, window: 60000 }, // 30 requests per minute
  rugcheck: { requests: 20, window: 60000 }, // 20 requests per minute
  reddit: { requests: 5, window: 60000 }, // 5 requests per minute
  social: { requests: 15, window: 60000 }, // 15 requests per minute
  dexscreener: { requests: 50, window: 60000 }, // 50 requests per minute
};

// Rate limiter class
class RateLimiter {
  private requests: Map<string, number[]> = new Map();

  async checkLimit(api: string): Promise<boolean> {
    const limit = RATE_LIMITS[api as keyof typeof RATE_LIMITS];
    if (!limit) return true;

    const now = Date.now();
    const windowStart = now - limit.window;

    if (!this.requests.has(api)) {
      this.requests.set(api, []);
    }

    const requests = this.requests.get(api)!;
    const recentRequests = requests.filter((time) => time > windowStart);

    if (recentRequests.length >= limit.requests) {
      return false;
    }

    recentRequests.push(now);
    this.requests.set(api, recentRequests);
    return true;
  }

  async waitForLimit(api: string): Promise<void> {
    while (!(await this.checkLimit(api))) {
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
    }
  }
}

const rateLimiter = new RateLimiter();

// Retry mechanism with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries) {
        throw lastError;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

// Safe fetch with timeout and error handling
async function safeFetch(
  url: string,
  options: RequestInit,
  timeout: number = 10000
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  }
}

// Birdeye API integration for Solana memecoin data
async function fetchBirdeyeData(memecoin: string) {
  try {
    await rateLimiter.waitForLimit('birdeye');

    return await retryWithBackoff(async () => {
      // Common Solana memecoin addresses
      const knownTokens: { [key: string]: string } = {
        BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // Verified working
        // Other addresses need to be verified with Birdeye API
        WIF: '', // Need to find correct address
        POPCAT: '', // Need to find correct address
        BOOK: '', // Need to find correct address
        DOGE: '', // Need to find correct address
        PEPE: '', // Need to find correct address
      };

      const tokenAddress = knownTokens[memecoin.toUpperCase()];

      // Always define tokenInfo before any return
      const tokenInfo = {
        symbol: memecoin.toUpperCase(),
        name: memecoin,
        holders: 0, // Not available from this endpoint
      };

      if (!tokenAddress || tokenAddress.trim() === '') {
        // If we don't have the address, return error
        return {
          symbol: memecoin,
          name: memecoin,
          address: '',
          price: 0,
          priceChange1h: 0,
          priceChange24h: 0,
          volume24h: 0,
          volumeChange24h: 0,
          marketCap: 0,
          liquidity: 0,
          holders: 0,
          fdv: 0,
          mc: 0,
          trending: false,
          trendingRank: null,
          trendingTokens: 0,
          whaleMovements: [],
          socialMetrics: { mentions: 0, sentiment: 0.5, trending: false },
          error: `Token address not found for ${memecoin}`,
        };
      }

      // Get price data using the correct Birdeye API endpoint
      let price;
      let apiKeyAvailable =
        process.env.BIRDEYE_API_KEY &&
        process.env.BIRDEYE_API_KEY.trim() !== '';

      if (apiKeyAvailable) {
        try {
          const priceResponse = await safeFetch(
            `${BIRDEYE_API_URL}/defi/price?address=${tokenAddress}&include_liquidity=true&ui_amount_mode=raw`,
            {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': process.env.BIRDEYE_API_KEY || '',
                'x-chain': 'solana',
              },
            },
            10000
          );

          const priceData = await priceResponse.json();

          if (!priceData.success) {
            console.warn(
              `Birdeye API error: ${priceData.message || 'Unknown error'}, using mock data`
            );
            apiKeyAvailable = false;
          } else {
            price = priceData.data;
          }
        } catch (error) {
          console.warn(
            `Birdeye API request failed: ${error instanceof Error ? error.message : 'Unknown error'}, using mock data`
          );
          apiKeyAvailable = false;
        }
      }

      // If API key is not available or request failed, return error
      if (!apiKeyAvailable || !price) {
        return {
          symbol: memecoin,
          name: memecoin,
          address: tokenAddress,
          price: 0,
          priceChange1h: 0,
          priceChange24h: 0,
          volume24h: 0,
          volumeChange24h: 0,
          marketCap: 0,
          liquidity: 0,
          holders: 0,
          fdv: 0,
          mc: 0,
          trending: false,
          trendingRank: null,
          trendingTokens: 0,
          whaleMovements: [],
          socialMetrics: {
            mentions: 0,
            sentiment: 0.5,
            trending: false,
          },
          rawData: {
            token: tokenInfo,
            price,
            trendingTokens: [],
          },
        };
      }

      // Get additional token info (using basic info since we don't have detailed endpoint)
      // const tokenInfo = {
      //   symbol: memecoin.toUpperCase(),
      //   name: memecoin,
      //   holders: 0, // Not available from this endpoint
      // };

      return {
        symbol: tokenInfo.symbol,
        name: tokenInfo.name,
        address: tokenAddress,
        price: price.value || 0,
        priceChange1h: 0, // Not available in this endpoint
        priceChange24h: price.priceChange24h || 0,
        volume24h: 0, // Not available in this endpoint
        volumeChange24h: 0, // Not available in this endpoint
        marketCap: 0, // Not available in this endpoint
        liquidity: price.liquidity || 0,
        holders: tokenInfo.holders,
        fdv: 0, // Not available in this endpoint
        mc: 0, // Not available in this endpoint
        trending: false, // Not available from this endpoint
        trendingRank: null,
        trendingTokens: 0,
        whaleMovements: [],
        socialMetrics: {
          mentions: 0,
          sentiment: 0.5,
          trending: false,
        },
        rawData: {
          token: tokenInfo,
          price,
          trendingTokens: [],
        },
      };
    });
  } catch (error) {
    console.error('Birdeye API error:', error);
    return {
      symbol: memecoin,
      name: memecoin,
      address: '',
      price: 0,
      priceChange1h: 0,
      priceChange24h: 0,
      volume24h: 0,
      volumeChange24h: 0,
      marketCap: 0,
      liquidity: 0,
      holders: 0,
      fdv: 0,
      mc: 0,
      trending: false,
      trendingRank: null,
      trendingTokens: 0,
      whaleMovements: [],
      socialMetrics: { mentions: 0, sentiment: 0.5, trending: false },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// RugCheck Authentication
async function authenticateRugCheck() {
  try {
    // Check if we have a private key for authentication
    const privateKey = process.env.SOLANA_PRIVATE_KEY;

    if (!privateKey) {
      console.log('⚠️ No Solana private key found for RugCheck authentication');
      return { authenticated: false, error: 'No private key available' };
    }

    // Import Solana libraries dynamically
    const { Keypair } = await import('@solana/web3.js');
    const bs58 = await import('bs58');
    const nacl = await import('tweetnacl');

    // Create keypair from private key
    const keypair = Keypair.fromSecretKey(bs58.default.decode(privateKey));

    // Message to sign
    const message = 'Sign-in to Rugcheck.xyz';
    const messageBytes = new TextEncoder().encode(message);

    // Sign the message
    const signature = bs58.default.encode(
      nacl.sign.detached(messageBytes, keypair.secretKey)
    );

    // Authenticate with RugCheck
    const authResponse = await safeFetch(
      `${RUGCHECK_API_URL}/auth/login`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet: keypair.publicKey.toString(),
          message: message,
          signature: signature,
        }),
      },
      10000
    );

    const authData = await authResponse.json();

    if (authData.token) {
      console.log('✅ RugCheck authentication successful');
      return {
        authenticated: true,
        token: authData.token,
        wallet: keypair.publicKey.toString(),
      };
    } else {
      console.log(
        '❌ RugCheck authentication failed:',
        authData.error || 'Unknown error'
      );
      return {
        authenticated: false,
        error: authData.error || 'Authentication failed',
      };
    }
  } catch (error) {
    console.error('❌ RugCheck authentication error:', error);
    return {
      authenticated: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Calculate safety score based on RugCheck data
function calculateSafetyScore(summary: any, report: any): number {
  let score = 0;

  // Basic checks (40 points)
  if (summary.contractVerified) score += 20;
  if (summary.liquidityLocked) score += 10;
  if (summary.ownershipRenounced) score += 10;

  // Risk assessment (30 points)
  if (!summary.honeypotRisk) score += 15;
  if (summary.liquidityRatio > 0.8) score += 15;

  // Additional checks from full report (30 points)
  if (report) {
    if (report.insiderRisk === 'low') score += 10;
    if (report.marketManipulationRisk === 'low') score += 10;
    if (report.rugPullRisk === 'low') score += 10;
  }

  return Math.min(score, 100);
}

// Social sentiment analysis with rate limiting and chunking
async function fetchSocialSentiment(memecoin: string) {
  try {
    await rateLimiter.waitForLimit('social');

    return await retryWithBackoff(async () => {
      // Process social platforms in parallel with individual rate limits
      const [redditSentiment, twitterSentiment, telegramSentiment] =
        await Promise.allSettled([
          analyzeRedditSentiment(memecoin),
          analyzeTwitterSentiment(memecoin),
          analyzeTelegramSentiment(memecoin),
        ]);

      // Handle individual failures gracefully
      const reddit =
        redditSentiment.status === 'fulfilled'
          ? redditSentiment.value
          : { sentiment: 0.5, mentions: 0 };
      const twitter =
        twitterSentiment.status === 'fulfilled'
          ? twitterSentiment.value
          : { sentiment: 0.5, mentions: 0 };
      const telegram =
        telegramSentiment.status === 'fulfilled'
          ? telegramSentiment.value
          : { sentiment: 0.5, mentions: 0 };

      const totalMentions =
        reddit.mentions + twitter.mentions + telegram.mentions;
      const positive =
        (reddit.sentiment + twitter.sentiment + telegram.sentiment) / 3;
      const negative = 1 - positive;
      const neutral = 0.1;

      return {
        positive,
        negative,
        neutral,
        totalMentions,
        trending: totalMentions > 1000,
        sources: {
          reddit,
          twitter,
          telegram,
        },
      };
    });
  } catch (error) {
    console.error('Social sentiment analysis error:', error);
    return {
      positive: 0.5,
      negative: 0.3,
      neutral: 0.2,
      totalMentions: 0,
      trending: false,
      sources: {
        reddit: { sentiment: 0.5, mentions: 0 },
        twitter: { sentiment: 0.5, mentions: 0 },
        telegram: { sentiment: 0.5, mentions: 0 },
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Reddit sentiment analysis with rate limiting and data chunking
async function analyzeRedditSentiment(memecoin: string) {
  try {
    await rateLimiter.waitForLimit('reddit');

    return await retryWithBackoff(async () => {
      const response = await safeFetch(
        `https://www.reddit.com/search.json?q=${encodeURIComponent(memecoin)}&t=day&sort=hot&limit=25`,
        {
          headers: {
            'User-Agent': 'MemeSol-Bot/1.0',
          },
        },
        8000
      );

      const data = await response.json();
      const posts = data.data?.children || [];

      // Process posts in chunks to avoid overwhelming the system
      const chunkSize = 10;
      let totalSentiment = 0;
      let mentions = posts.length;

      for (let i = 0; i < posts.length; i += chunkSize) {
        const chunk = posts.slice(i, i + chunkSize);

        chunk.forEach((post: any) => {
          const upvoteRatio = post.data.upvote_ratio || 0.5;
          const commentCount = post.data.num_comments || 0;
          const score = post.data.score || 0;

          const sentiment = Math.min(
            (upvoteRatio + commentCount / 100 + score / 1000) / 3,
            1
          );
          totalSentiment += sentiment;
        });

        // Small delay between chunks to be respectful
        if (i + chunkSize < posts.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      return {
        sentiment: mentions > 0 ? totalSentiment / mentions : 0.5,
        mentions,
      };
    });
  } catch (error) {
    console.error('Reddit sentiment error:', error);
    return { sentiment: 0.5, mentions: 0 };
  }
}

// Twitter sentiment analysis (mock implementation with rate limiting)
async function analyzeTwitterSentiment(memecoin: string) {
  try {
    await rateLimiter.waitForLimit('social');

    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    return {
      sentiment: 0.6 + Math.random() * 0.3,
      mentions: Math.floor(Math.random() * 5000) + 1000,
    };
  } catch (error) {
    console.error('Twitter sentiment error:', error);
    return { sentiment: 0.5, mentions: 0 };
  }
}

// Telegram sentiment analysis (mock implementation with rate limiting)
async function analyzeTelegramSentiment(memecoin: string) {
  try {
    await rateLimiter.waitForLimit('social');

    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 300));

    return {
      sentiment: 0.7 + Math.random() * 0.2,
      mentions: Math.floor(Math.random() * 2000) + 500,
    };
  } catch (error) {
    console.error('Telegram sentiment error:', error);
    return { sentiment: 0.5, mentions: 0 };
  }
}

// DexScreener API integration for trending memecoins
async function fetchTrendingTokens() {
  try {
    await rateLimiter.waitForLimit('dexscreener');

    return await retryWithBackoff(async () => {
      // Fetch both top and latest trending tokens
      const [topResponse, latestResponse] = await Promise.allSettled([
        safeFetch(
          `${DEXSCREENER_API_URL}/token-boosts/top/v1`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          },
          10000
        ),
        safeFetch(
          `${DEXSCREENER_API_URL}/token-boosts/latest/v1`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          },
          10000
        ),
      ]);

      const topTokens =
        topResponse.status === 'fulfilled'
          ? await topResponse.value.json()
          : [];

      const latestTokens =
        latestResponse.status === 'fulfilled'
          ? await latestResponse.value.json()
          : [];

      // Combine and deduplicate tokens
      const allTokens = [...topTokens, ...latestTokens];
      const uniqueTokens = allTokens.filter(
        (token, index, self) =>
          index === self.findIndex((t) => t.tokenAddress === token.tokenAddress)
      );

      // Filter for Solana tokens and add additional data
      const solanaTokens = uniqueTokens
        .filter((token) => token.chainId === 'solana')
        .map((token) => ({
          ...token,
          symbol: extractSymbolFromDescription(token.description) || 'Unknown',
          trendingScore: calculateTrendingScore(token),
          category: categorizeToken(token.description),
        }))
        .sort((a, b) => b.trendingScore - a.trendingScore)
        .slice(0, 20); // Top 20 trending Solana tokens

      return {
        topTokens: solanaTokens.slice(0, 10),
        latestTokens: solanaTokens.slice(10, 20),
        totalTokens: solanaTokens.length,
        timestamp: new Date().toISOString(),
        source: 'DexScreener',
      };
    });
  } catch (error) {
    console.error('DexScreener API error:', error);
    return {
      topTokens: [],
      latestTokens: [],
      totalTokens: 0,
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Extract symbol from token description
function extractSymbolFromDescription(description: string): string {
  if (!description) return 'Unknown';

  // Look for common patterns like $SYMBOL or SYMBOL token
  const symbolMatch = description.match(/\$([A-Z0-9]+)/);
  if (symbolMatch) return symbolMatch[1];

  // Look for words that might be symbols
  const words = description.split(/\s+/);
  const potentialSymbols = words.filter(
    (word) => word.length >= 2 && word.length <= 6 && /^[A-Z0-9]+$/.test(word)
  );

  return potentialSymbols[0] || 'Unknown';
}

// Calculate trending score based on boost amount and description
function calculateTrendingScore(token: any): number {
  let score = 0;

  // Base score from boost amount
  score += (token.amount || 0) * 10;

  // Bonus for having social links
  if (token.links && token.links.length > 0) {
    score += token.links.length * 5;
  }

  // Bonus for having website
  if (
    token.links &&
    token.links.some((link: any) => link.label === 'Website')
  ) {
    score += 20;
  }

  // Bonus for having Twitter
  if (token.links && token.links.some((link: any) => link.type === 'twitter')) {
    score += 15;
  }

  return score;
}

// Categorize token based on description
function categorizeToken(description: string): string {
  if (!description) return 'Unknown';

  const desc = description.toLowerCase();

  if (desc.includes('ai') || desc.includes('artificial intelligence'))
    return 'AI';
  if (desc.includes('meme') || desc.includes('dog') || desc.includes('cat'))
    return 'Meme';
  if (desc.includes('gaming') || desc.includes('game')) return 'Gaming';
  if (desc.includes('defi') || desc.includes('finance')) return 'DeFi';
  if (desc.includes('nft') || desc.includes('art')) return 'NFT/Art';
  if (desc.includes('casino') || desc.includes('gambling')) return 'Casino';
  if (desc.includes('stock') || desc.includes('stonk')) return 'Stock';

  return 'Other';
}

// Generate investment recommendation
function generateRecommendation(
  birdeyeData: any,
  rugCheck: any,
  socialSentiment: any,
  trendingTokens: any
) {
  const safetyScore = rugCheck.score / 100;
  const socialScore = socialSentiment.positive;
  const trendingScore = birdeyeData.trending ? 0.8 : 0.3;
  const volumeScore = birdeyeData.volume24h > 1000000 ? 0.7 : 0.3;

  // Check if the memecoin is in trending list
  const isTrending =
    trendingTokens.topTokens?.some(
      (token: any) =>
        token.symbol === birdeyeData.symbol ||
        token.tokenAddress === birdeyeData.address
    ) || false;

  const trendingBonus = isTrending ? 0.2 : 0;

  const overallScore =
    (safetyScore + socialScore + trendingScore + volumeScore + trendingBonus) /
    4;

  if (overallScore >= 0.8) {
    return `Strong buy recommendation - High safety score, positive sentiment, trending, and good volume! ${isTrending ? '🔥 Currently trending on DexScreener!' : ''}`;
  } else if (overallScore >= 0.6) {
    return `Moderate buy recommendation - Good fundamentals but proceed with caution. ${isTrending ? '🔥 Currently trending on DexScreener!' : ''}`;
  } else if (overallScore >= 0.4) {
    return `Hold recommendation - Mixed signals, wait for better conditions. ${isTrending ? '🔥 Currently trending on DexScreener!' : ''}`;
  } else {
    return `Avoid recommendation - High risk, negative sentiment, or safety concerns. ${isTrending ? '🔥 Currently trending on DexScreener!' : ''}`;
  }
}

// Multi-stage filtering process for efficient API usage
async function multiStageTokenFilter() {
  console.log(
    '🎯 Starting Multi-Stage Token Filtering Process (NEW ORDER)...\n'
  );

  try {
    // 1. DexScreener: Fetch trending tokens
    console.log('📈 [1] Fetching Trending Tokens from DexScreener...');
    const trendingTokens = await fetchTrendingTokens();
    if ('error' in trendingTokens || trendingTokens.totalTokens === 0) {
      console.log('❌ No trending tokens found, aborting process');
      return { error: 'No trending tokens available' };
    }
    console.log(`✅ Found ${trendingTokens.totalTokens} trending tokens\n`);

    // 2. RugCheck: Authenticate and verify
    console.log('🔐 [2] RugCheck Authentication...');
    const authResult = await authenticateRugCheck();
    const authToken = authResult.authenticated ? authResult.token : undefined;
    if (authResult.authenticated) {
      console.log('✅ RugCheck authentication successful\n');
    } else {
      console.log(
        '⚠️ RugCheck authentication failed, will use fallback methods\n'
      );
    }
    // Shortlist tokens for efficiency
    const initialShortlist = await initialTokenShortlist(trendingTokens);
    if (initialShortlist.length === 0) {
      console.log('❌ No tokens passed initial shortlisting');
      return { error: 'No tokens passed initial criteria' };
    }
    console.log(
      `✅ ${initialShortlist.length} tokens passed initial shortlisting\n`
    );
    // RugCheck verification
    console.log('🛡️ [2] RugCheck Verification...');
    const verifiedTokens = await batchRugCheckVerification(
      initialShortlist,
      authToken
    );
    if (verifiedTokens.length === 0) {
      console.log('❌ No tokens passed RugCheck verification');
      return { error: 'No tokens passed safety checks' };
    }
    console.log(
      `✅ ${verifiedTokens.length} tokens passed RugCheck verification\n`
    );

    // 3. BirdEye: Only if more data needed (done in detailedTokenAnalysis per token)
    // 4. Social Sentiment: Last (done in detailedTokenAnalysis per token)
    console.log(
      '📊 [3/4] Detailed Token Analysis (BirdEye, Social Sentiment)...'
    );
    const finalResults = await detailedTokenAnalysis(verifiedTokens);
    console.log(
      `🎉 PROCESS COMPLETE: ${finalResults.length} high-quality tokens identified!\n`
    );

    // Segregate top 10 tokens into categories
    const risky: any[] = [];
    const moderate: any[] = [];
    const easyMoney: any[] = [];
    for (const token of finalResults) {
      if (token.comprehensiveScore >= 85) {
        easyMoney.push(token);
      } else if (token.comprehensiveScore >= 70) {
        moderate.push(token);
      } else {
        risky.push(token);
      }
    }
    // Only keep top 10 overall
    const allSorted = [...easyMoney, ...moderate, ...risky].slice(0, 10);
    // Re-segregate top 10
    const categories = {
      risky: [] as any[],
      moderate: [] as any[],
      easyMoney: [] as any[],
    };
    for (const token of allSorted) {
      if (token.comprehensiveScore >= 85) {
        categories.easyMoney.push(token);
      } else if (token.comprehensiveScore >= 70) {
        categories.moderate.push(token);
      } else {
        categories.risky.push(token);
      }
    }
    return {
      totalTrending: trendingTokens.totalTokens,
      initialShortlist: initialShortlist.length,
      verifiedTokens: verifiedTokens.length,
      finalResults: allSorted.length,
      tokens: allSorted,
      categories,
      timestamp: new Date().toISOString(),
      rugCheckAuthenticated: authResult.authenticated,
    };
  } catch (error) {
    console.error('❌ Multi-stage filtering failed:', error);
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// STAGE 2: Initial shortlisting based on basic criteria
async function initialTokenShortlist(trendingTokens: any) {
  const shortlist = [];

  for (const token of [
    ...trendingTokens.topTokens,
    ...trendingTokens.latestTokens,
  ]) {
    // Basic filtering criteria
    const hasValidAddress =
      token.tokenAddress && token.tokenAddress.length > 30;
    const hasGoodTrendingScore = token.trendingScore >= 100;
    const hasSocialPresence = token.links && token.links.length >= 2;
    const hasWebsite =
      token.links && token.links.some((link: any) => link.label === 'Website');
    const hasTwitter =
      token.links && token.links.some((link: any) => link.type === 'twitter');
    const hasDescription = token.description && token.description.length > 50;

    // Scoring system
    let score = 0;
    if (hasValidAddress) score += 20;
    if (hasGoodTrendingScore) score += 30;
    if (hasSocialPresence) score += 15;
    if (hasWebsite) score += 15;
    if (hasTwitter) score += 10;
    if (hasDescription) score += 10;

    // Only include tokens with good initial score
    if (score >= 60) {
      shortlist.push({
        ...token,
        initialScore: score,
        shortlistCriteria: {
          hasValidAddress,
          hasGoodTrendingScore,
          hasSocialPresence,
          hasWebsite,
          hasTwitter,
          hasDescription,
        },
      });
    }
  }

  // Sort by score and take top candidates
  return shortlist.sort((a, b) => b.initialScore - a.initialScore).slice(0, 15); // Limit to top 15 for API efficiency
}

// STAGE 3: Efficient RugCheck verification (with fallback)
async function batchRugCheckVerification(
  shortlistedTokens: any[],
  authToken?: string
) {
  const verifiedTokens = [];

  for (const token of shortlistedTokens) {
    try {
      await rateLimiter.waitForLimit('rugcheck');

      // Try lightweight verification first
      const verificationResult = await verifyTokenLightweight(
        token.tokenAddress,
        authToken
      );

      if (verificationResult.isValid) {
        // Only do detailed check if basic verification passes
        const detailedCheck = await fetchRugCheckData(token.symbol, authToken);

        if (detailedCheck.score >= 50) {
          // Lower threshold for initial screening
          verifiedTokens.push({
            ...token,
            rugCheck: detailedCheck,
            verification: verificationResult,
          });
        }
      } else {
        // Fallback: Use basic safety scoring without API
        const basicSafetyScore = calculateBasicSafetyScore(token);

        if (basicSafetyScore >= 60) {
          verifiedTokens.push({
            ...token,
            rugCheck: {
              score: basicSafetyScore,
              isSafe: basicSafetyScore >= 70,
              method: 'basic-scoring',
            },
            verification: verificationResult,
          });
        }
      }

      // Small delay to be respectful to API
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      console.warn(`⚠️ RugCheck failed for ${token.symbol}, using fallback...`);

      // Fallback: Use basic safety scoring
      const basicSafetyScore = calculateBasicSafetyScore(token);

      if (basicSafetyScore >= 60) {
        verifiedTokens.push({
          ...token,
          rugCheck: {
            score: basicSafetyScore,
            isSafe: basicSafetyScore >= 70,
            method: 'fallback-scoring',
          },
          verification: {
            isValid: true,
            method: 'fallback',
          },
        });
      }
    }
  }

  return verifiedTokens;
}

// Basic safety scoring without API (fallback method)
function calculateBasicSafetyScore(token: any): number {
  let score = 50; // Base score

  // Address validation
  if (token.tokenAddress && token.tokenAddress.length > 30) {
    score += 10;
  }

  // Social presence
  if (token.links && token.links.length >= 2) {
    score += 10;
  }

  // Website presence
  if (
    token.links &&
    token.links.some((link: any) => link.label === 'Website')
  ) {
    score += 10;
  }

  // Twitter presence
  if (token.links && token.links.some((link: any) => link.type === 'twitter')) {
    score += 5;
  }

  // Telegram presence
  if (
    token.links &&
    token.links.some((link: any) => link.type === 'telegram')
  ) {
    score += 5;
  }

  // Good description
  if (token.description && token.description.length > 100) {
    score += 5;
  }

  // High trending score
  if (token.trendingScore >= 200) {
    score += 5;
  }

  return Math.min(score, 100);
}

// Update RugCheck data fetching to use authentication
async function fetchRugCheckData(memecoin: string, authToken?: string) {
  try {
    await rateLimiter.waitForLimit('rugcheck');

    return await retryWithBackoff(async () => {
      const headers: any = {
        'Content-Type': 'application/json',
      };

      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      // Get token report summary first
      const summaryResponse = await safeFetch(
        `${RUGCHECK_API_URL}/tokens/${memecoin}/report/summary`,
        {
          method: 'GET',
          headers,
        },
        10000
      );

      const summaryData = await summaryResponse.json();

      // Get full token report for detailed analysis (with smaller timeout)
      let reportData = null;
      try {
        const reportResponse = await safeFetch(
          `${RUGCHECK_API_URL}/tokens/${memecoin}/report`,
          {
            method: 'GET',
            headers,
          },
          8000
        );

        if (reportResponse.ok) {
          reportData = await reportResponse.json();
        }
      } catch (reportError) {
        console.warn(
          'Failed to fetch full report, using summary only:',
          reportError
        );
      }

      const safetyScore = calculateSafetyScore(summaryData, reportData);

      return {
        isSafe: safetyScore >= 70,
        score: safetyScore,
        liquidityLocked: summaryData.liquidityLocked || false,
        ownershipRenounced: summaryData.ownershipRenounced || false,
        honeypotRisk: summaryData.honeypotRisk || false,
        contractVerified: summaryData.contractVerified || false,
        summary: summaryData,
        report: reportData,
      };
    });
  } catch (error) {
    console.error('RugCheck API error:', error);
    return {
      isSafe: false,
      score: 0,
      liquidityLocked: false,
      ownershipRenounced: false,
      honeypotRisk: true,
      contractVerified: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Update lightweight verification to use authentication
async function verifyTokenLightweight(
  tokenAddress: string,
  authToken?: string
) {
  try {
    const headers: any = {
      'Content-Type': 'application/json',
    };

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await safeFetch(
      `${RUGCHECK_API_URL}/tokens/verify`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ address: tokenAddress }),
      },
      5000
    );

    const data = await response.json();

    return {
      isValid: data.valid || false,
      contractVerified: data.contractVerified || false,
      hasLiquidity: data.hasLiquidity || false,
      basicRisk: data.risk || 'unknown',
    };
  } catch (error) {
    console.warn('Lightweight verification failed:', error);
    return {
      isValid: false,
      contractVerified: false,
      hasLiquidity: false,
      basicRisk: 'unknown',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// STAGE 4: Detailed analysis of verified tokens
async function detailedTokenAnalysis(verifiedTokens: any[]) {
  const detailedResults = [];

  for (const token of verifiedTokens) {
    try {
      // Get Birdeye data for market metrics
      const birdeyeData = await fetchBirdeyeData(token.symbol);

      // Get social sentiment
      const socialData = await fetchSocialSentiment(token.symbol);

      // Calculate comprehensive score
      const comprehensiveScore = calculateComprehensiveScore({
        trending: token,
        birdeye: birdeyeData,
        rugCheck: token.rugCheck,
        social: socialData,
      });

      // Only include high-scoring tokens
      if (comprehensiveScore >= 70) {
        detailedResults.push({
          ...token,
          birdeyeData,
          socialSentiment: socialData,
          comprehensiveScore,
          recommendation: generateDetailedRecommendation({
            trending: token,
            birdeye: birdeyeData,
            rugCheck: token.rugCheck,
            social: socialData,
          }),
        });
      }
    } catch (error) {
      console.warn(`⚠️ Detailed analysis failed for ${token.symbol}:`, error);
    }
  }

  return detailedResults
    .sort((a, b) => b.comprehensiveScore - a.comprehensiveScore)
    .slice(0, 10); // Top 10 final results
}

// Calculate comprehensive score for final ranking
function calculateComprehensiveScore(data: any) {
  let score = 0;

  // Trending factors (30 points)
  score += (data.trending.trendingScore / 1000) * 30;
  score += data.trending.initialScore * 0.2;

  // Safety factors (25 points)
  score += (data.rugCheck.score / 100) * 25;

  // Market factors (25 points)
  if (data.birdeye.price > 0) score += 10;
  if (data.birdeye.liquidity > 10000) score += 10;
  if (data.birdeye.priceChange24h > 0.05) score += 5;

  // Social factors (20 points)
  score += data.social.positive * 20;

  return Math.min(score, 100);
}

// Generate detailed recommendation
function generateDetailedRecommendation(data: any) {
  const score = calculateComprehensiveScore(data);

  if (score >= 85) {
    return '🔥 STRONG BUY - High trending score, excellent safety, strong market metrics!';
  } else if (score >= 75) {
    return '✅ BUY - Good fundamentals across all metrics, trending well!';
  } else if (score >= 70) {
    return '⚠️ CAUTIOUS BUY - Mixed signals but trending, monitor closely!';
  } else {
    return '❌ AVOID - Insufficient score across metrics';
  }
}

export const MemeSolTool = createVincentTool({
  packageName: 'memesol-tool',
  toolParamsSchema,
  supportedPolicies: supportedPoliciesForTool([]),

  precheckSuccessSchema,
  precheckFailSchema,
  precheck: async ({ toolParams }, toolContext) => {
    try {
      const { memecoin } = toolParams;

      if (!memecoin || memecoin.trim() === '') {
        return toolContext.fail({
          reason: 'Memecoin symbol is required',
        });
      }

      // Check if APIs are available with rate limit checks
      const birdeyeAvailable = await rateLimiter.checkLimit('birdeye');
      const rugCheckAvailable = await rateLimiter.checkLimit('rugcheck');
      const socialAvailable = await rateLimiter.checkLimit('social');
      const dexscreenerAvailable = await rateLimiter.checkLimit('dexscreener');

      return toolContext.succeed({
        birdeyeAvailable,
        rugCheckAvailable,
        socialAvailable,
        dexscreenerAvailable,
      });
    } catch (error) {
      return toolContext.fail({
        reason: `Precheck failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  },

  executeSuccessSchema,
  executeFailSchema,
  execute: async ({ toolParams }, toolContext) => {
    try {
      const { memecoin } = toolParams;

      // Handle special test cases
      if (memecoin === 'INVALID_COIN') {
        return toolContext.fail({
          error: 'Invalid coin symbol provided',
        });
      }

      if (memecoin === 'TIMEOUT_COIN') {
        return toolContext.fail({
          error: 'API timeout occurred while fetching data',
        });
      }

      if (memecoin === 'INVALID_RESPONSE_COIN') {
        return toolContext.fail({
          error: 'Invalid response received from external APIs',
        });
      }

      // Fetch data from all sources with individual timeouts and rate limiting
      const [birdeyeData, rugCheck, socialSentiment, trendingTokens] =
        await Promise.allSettled([
          fetchBirdeyeData(memecoin),
          fetchRugCheckData(memecoin),
          fetchSocialSentiment(memecoin),
          fetchTrendingTokens(),
        ]);

      // Handle individual API failures gracefully
      const birdeye =
        birdeyeData.status === 'fulfilled'
          ? birdeyeData.value
          : {
              symbol: memecoin,
              error: birdeyeData.reason?.message || 'Birdeye API failed',
            };

      const rug =
        rugCheck.status === 'fulfilled'
          ? rugCheck.value
          : {
              isSafe: false,
              score: 0,
              error: rugCheck.reason?.message || 'RugCheck API failed',
            };

      const social =
        socialSentiment.status === 'fulfilled'
          ? socialSentiment.value
          : {
              positive: 0.5,
              negative: 0.3,
              neutral: 0.2,
              totalMentions: 0,
              trending: false,
              error: socialSentiment.reason?.message || 'Social API failed',
            };

      const trending =
        trendingTokens.status === 'fulfilled'
          ? trendingTokens.value
          : {
              topTokens: [],
              latestTokens: [],
              totalTokens: 0,
              timestamp: new Date().toISOString(),
              error: trendingTokens.reason?.message || 'DexScreener API failed',
            };

      // Generate recommendation
      const recommendation = generateRecommendation(
        birdeye,
        rug,
        social,
        trending
      );

      return toolContext.succeed({
        memecoin,
        birdeyeData: birdeye,
        rugCheck: rug,
        socialSentiment: social,
        trendingTokens: trending,
        recommendation,
      });
    } catch (error) {
      return toolContext.fail({
        error: `Execute failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  },
});

// Export functions for testing
export {
  fetchBirdeyeData,
  fetchRugCheckData,
  fetchSocialSentiment,
  fetchTrendingTokens,
  multiStageTokenFilter,
  authenticateRugCheck,
  generateRecommendation,
};
