import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const memesolRedditTool = createTool({
  id: 'memesol-reddit',
  description: 'Fetch Reddit sentiment for a given memecoin symbol',
  inputSchema: z.object({ symbol: z.string() }),
  outputSchema: z.object({
    reddit: z.object({
      sentiment: z.number(),
      mentions: z.number(),
    }),
    error: z.string().optional(),
  }),
  async execute({ context }) {
    const { symbol } = context;
    try {
      const res = await fetch(
        `https://www.reddit.com/search.json?q=${encodeURIComponent(symbol)}&t=day&sort=hot&limit=25`,
        {
          headers: { 'User-Agent': 'MemeSol-Bot/1.0' },
        }
      );
      if (!res.ok)
        return {
          reddit: { sentiment: 0.5, mentions: 0 },
          error: 'Reddit API error',
        };
      const data = await res.json();
      const posts = data.data?.children || [];
      let totalSentiment = 0;
      let mentions = posts.length;
      for (const post of posts) {
        const upvoteRatio = post.data.upvote_ratio || 0.5;
        const commentCount = post.data.num_comments || 0;
        const score = post.data.score || 0;
        const sentiment = Math.min(
          (upvoteRatio + commentCount / 100 + score / 1000) / 3,
          1
        );
        totalSentiment += sentiment;
      }
      return {
        reddit: {
          sentiment: mentions > 0 ? totalSentiment / mentions : 0.5,
          mentions,
        },
      };
    } catch (err) {
      return {
        reddit: { sentiment: 0.5, mentions: 0 },
        error: (err as Error).message,
      };
    }
  },
});
