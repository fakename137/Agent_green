import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import axios from 'axios';

const SANTIMENT_API_URL = 'https://api.santiment.net/graphql';
const SANTIMENT_API_KEY = process.env.SANTIMENT_API_KEY;

export const memesolSantimentTool = createTool({
  id: 'memesol-santiment',
  description:
    'Fetch Santiment social sentiment metrics for a given memetoken slug',
  inputSchema: z.object({
    slug: z.string(),
    from: z.string().optional(),
    to: z.string().optional(),
    interval: z.string().default('1d'),
  }),
  outputSchema: z.object({
    positive: z.any(),
    negative: z.any(),
    error: z.string().optional(),
  }),
  async execute({ context }) {
    const { slug, from, to, interval } = context;
    const query = `{
      positive: getMetric(metric: \"sentiment_positive_total\"){
        timeseriesDataJson(
          selector: {slug: \"${slug}\"}
          from: \"${from}\"
          to: \"${to}\"
          interval: \"${interval}\")
      }
      negative: getMetric(metric: \"sentiment_negative_total\"){
        timeseriesDataJson(
          selector: {slug: \"${slug}\"}
          from: \"${from}\"
          to: \"${to}\"
          interval: \"${interval}\")
      }
    }`;
    try {
      const res = await axios.post(
        SANTIMENT_API_URL,
        { query },
        { headers: { Authorization: `Apikey ${SANTIMENT_API_KEY}` } }
      );
      return {
        positive: res.data.data.positive?.timeseriesDataJson,
        negative: res.data.data.negative?.timeseriesDataJson,
      };
    } catch (err) {
      if (axios.isAxiosError(err)) {
        console.error(
          'Santiment API error:',
          err.response?.data || err.message
        );
        return {
          positive: null,
          negative: null,
          error: JSON.stringify(err.response?.data || err.message),
        };
      }
      return {
        positive: null,
        negative: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

// This tool assumes you have a SQL API endpoint for querying memecoin trades and metadata
const SQL_API_URL = process.env.SQL_API_URL || '';
const SQL_API_KEY = process.env.SQL_API_KEY || '';

export const trendingMemecoinsTool = createTool({
  id: 'trending-memecoins',
  description:
    'Fetch trending memecoins by total trade volume over the last 6 days',
  inputSchema: z.object({
    platform: z.string().default('dexscreener'), // e.g., dexscreener, uniswap, etc.
    days: z.number().default(6),
  }),
  outputSchema: z.object({
    memecoins: z.array(
      z.object({
        asset_ref_id: z.string(),
        name: z.string(),
        sum_amount: z.number(),
      })
    ),
    error: z.string().optional(),
  }),
  async execute({ context }) {
    const { platform, days } = context;
    const sql = `
      SELECT DISTINCT tb1.asset_ref_id, tb2.name, tb1.sum_amount
      FROM (
        SELECT asset_ref_id, sum(CAST(amount, 'UInt64')) AS sum_amount
        FROM memecoin_trades
        WHERE dt >= (now() - INTERVAL ${days} DAY) and platform = '${platform}'
        GROUP BY asset_ref_id
        order by sum_amount
      ) AS tb1
      INNER JOIN memecoin_metadata AS tb2 ON tb1.asset_ref_id = tb2.asset_ref_id
      ORDER BY sum_amount DESC
    `;
    try {
      const res = await axios.post(
        SQL_API_URL,
        { query: sql },
        { headers: { Authorization: `Bearer ${SQL_API_KEY}` } }
      );
      return { memecoins: res.data.data || [] };
    } catch (err) {
      if (axios.isAxiosError(err)) {
        console.error('SQL API error:', err.response?.data || err.message);
        return {
          memecoins: [],
          error: JSON.stringify(err.response?.data || err.message),
        };
      }
      return {
        memecoins: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});
