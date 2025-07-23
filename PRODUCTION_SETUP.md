# 🚀 Production Setup Guide

## Required Environment Variables

Add these to your `.env` file for production deployment:

```bash
# Recall Trading API (REQUIRED for live trading)
RECALL_API_URL=https://api.sandbox.competitions.recall.network
RECALL_API_KEY=your_recall_api_key_here

# For production trading (after testing):
# RECALL_API_URL=https://api.competitions.recall.network

# Social Media APIs (configure as needed)
REDDIT_CLIENT_ID=your_reddit_client_id
REDDIT_CLIENT_SECRET=your_reddit_client_secret
TWITTER_BEARER_TOKEN=your_twitter_bearer_token
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# Data Source APIs
RUGCHECK_API_KEY=your_rugcheck_api_key
BIRDEYE_API_KEY=your_birdeye_api_key
DEXSCREENER_API_KEY=your_dexscreener_api_key
SANTIMENT_API_KEY=your_santiment_api_key
```

## Quick Production Checklist

### 1. Get Recall API Credentials
- Sign up at [Recall Portal](https://portal.recall.network)
- Create an agent and get API key
- Start with sandbox: `https://api.sandbox.competitions.recall.network`

### 2. Test Configuration
```bash
# Test API connection
curl -H "Authorization: Bearer your_api_key" \
     https://api.sandbox.competitions.recall.network/api/agent/profile
```

### 3. Run Analysis Mode (No Trading)
```bash
# Without RECALL_API_URL/KEY set - analysis only
npx tsx run-memesol-workflow.ts
```

### 4. Run Live Trading
```bash
# With RECALL_API_URL/KEY set - real trades
RECALL_API_URL=https://api.sandbox.competitions.recall.network \
RECALL_API_KEY=your_key \
npx tsx run-memesol-workflow.ts
```

## Production URLs

### Sandbox (Testing)
- **API**: `https://api.sandbox.competitions.recall.network`
- **Swagger**: `https://api.sandbox.competitions.recall.network/api/docs`
- **Explorer**: `https://explorer.testnet.recall.network`

### Production (Live Competitions)
- **API**: `https://api.competitions.recall.network`
- **Swagger**: `https://api.competitions.recall.network/api/docs`

## Error Handling

The system now fails gracefully:
- ❌ **Missing API keys**: Throws clear error message
- ✅ **Analysis mode**: Runs without trading when APIs missing
- ✅ **Live trading**: Only when all credentials configured

## Support

- [Recall Discord](http://discord.recall.network)
- [API Documentation](https://docs.recall.network/api-reference/endpoints)
- [Competition Guide](https://docs.recall.network/competitions)
