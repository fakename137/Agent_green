import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import axios from 'axios';

// Set your Twitter Bearer Token in the environment
const TWITTER_BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN;
const TWITTER_API_URL = 'https://api.twitter.com/2/tweets/search/recent';

// Dynamic rate limit state
let rateLimitRemaining: number | null = null;
let rateLimitReset: number | null = null;
let lastRequestTime = 0;

async function dynamicRateLimit() {
  const now = Date.now();
  if (
    rateLimitRemaining !== null &&
    rateLimitRemaining <= 0 &&
    rateLimitReset
  ) {
    const waitMs = rateLimitReset * 1000 - now;
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  } else {
    // Default: 1 request per second
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < 1000) {
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 - timeSinceLastRequest)
      );
    }
  }
  lastRequestTime = Date.now();
}

export const memesolTwitterTool = createTool({
  id: 'memesol-twitter',
  description:
    'Fetch Twitter sentiment and mention count for a given memecoin symbol using Twitter API v2',
  inputSchema: z.object({ symbol: z.string() }),
  outputSchema: z.object({
    twitter: z.object({
      sentiment: z.number(),
      mentions: z.number(),
    }),
    error: z.string().optional(),
  }),
  async execute({ context }) {
    const { symbol } = context;
    if (!TWITTER_BEARER_TOKEN) {
      return {
        twitter: { sentiment: 0.5, mentions: 0 },
        error: 'Twitter Bearer Token not set in environment',
      };
    }
    let backoffMs = 2000; // Start with 2 seconds for exponential backoff
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await dynamicRateLimit();
        const params = {
          query: `${symbol} lang:en -is:retweet`,
          max_results: 25,
          'tweet.fields': 'public_metrics',
        };
        const res = await axios.get(TWITTER_API_URL, {
          params,
          headers: {
            Authorization: `Bearer ${TWITTER_BEARER_TOKEN}`,
          },
        });
        // Update rate limit state from headers
        rateLimitRemaining = res.headers['x-rate-limit-remaining']
          ? parseInt(res.headers['x-rate-limit-remaining'])
          : null;
        rateLimitReset = res.headers['x-rate-limit-reset']
          ? parseInt(res.headers['x-rate-limit-reset'])
          : null;
        if (!res.data || !res.data.data) {
          return {
            twitter: { sentiment: 0.5, mentions: 0 },
            error: 'No tweets found',
          };
        }
        const tweets = res.data.data;
        let totalSentiment = 0;
        let mentions = tweets.length;
        for (const tweet of tweets) {
          // Simple sentiment: positive if contains 🚀, negative if contains 💀, neutral otherwise
          let sentiment = 0.5;
          if (/🚀|moon|bull|pump|win|gain/i.test(tweet.text)) sentiment = 1;
          if (/💀|rug|scam|dump|lose|rekt/i.test(tweet.text)) sentiment = 0;
          // Weight by likes and retweets
          const metrics = tweet.public_metrics || {};
          const weight =
            1 +
            (metrics.like_count || 0) / 10 +
            (metrics.retweet_count || 0) / 10;
          totalSentiment += sentiment * weight;
        }
        // Normalize by total weighted mentions
        const totalWeight = tweets.reduce((sum: number, tweet: any) => {
          const metrics = tweet.public_metrics || {};
          return (
            sum +
            1 +
            (metrics.like_count || 0) / 10 +
            (metrics.retweet_count || 0) / 10
          );
        }, 0);
        return {
          twitter: {
            sentiment: totalWeight > 0 ? totalSentiment / totalWeight : 0.5,
            mentions,
          },
        };
      } catch (err: any) {
        // Handle rate limit (429) with exponential backoff
        if (err.response && err.response.status === 429) {
          const resetHeader = err.response.headers['x-rate-limit-reset'];
          const now = Date.now();
          let waitMs = backoffMs;
          if (resetHeader) {
            const resetTime = parseInt(resetHeader) * 1000;
            waitMs = Math.max(resetTime - now, backoffMs);
          }
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          backoffMs *= 2; // Exponential backoff
          continue;
        }
        return {
          twitter: { sentiment: 0.5, mentions: 0 },
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
    return {
      twitter: { sentiment: 0.5, mentions: 0 },
      error: 'Failed after multiple attempts due to rate limiting or errors.',
    };
  },
});
