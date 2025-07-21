// Test Birdeye API integration
import { fetchBirdeyeData } from './src/mastra/tools/memesol-tool.ts';

async function testBirdeyeAPI() {
  console.log('🚀 Testing Birdeye API Integration...\n');

  // Test with a popular Solana memecoin
  const testCoins = ['BONK', 'WIF', 'POPCAT', 'BOOK'];

  for (const coin of testCoins) {
    console.log(`📊 Testing ${coin}...`);
    try {
      const data = await fetchBirdeyeData(coin);

      if (data.error) {
        console.log(`   ❌ Error: ${data.error}`);
      } else {
        console.log(`   ✅ Success!`);
        console.log(`      Symbol: ${data.symbol}`);
        console.log(`      Name: ${data.name}`);
        console.log(`      Price: $${data.price?.toFixed(6) || 'N/A'}`);
        console.log(
          `      Market Cap: $${(data.marketCap / 1000000).toFixed(2)}M`
        );
        console.log(
          `      Volume 24h: $${(data.volume24h / 1000).toFixed(2)}K`
        );
        console.log(`      Trending: ${data.trending ? 'Yes' : 'No'}`);
        console.log(
          `      Holders: ${data.holders?.toLocaleString() || 'N/A'}`
        );
        if (data.liquidity > 0) {
          console.log(
            `      Liquidity: $${(data.liquidity / 1000000).toFixed(2)}M`
          );
        }
        if (data.priceChange24h !== 0) {
          console.log(
            `      24h Change: ${(data.priceChange24h * 100).toFixed(2)}%`
          );
        }
      }
    } catch (error) {
      console.log(`   ❌ Exception: ${error.message}`);
    }
    console.log('');
  }
}

testBirdeyeAPI().catch(console.error);
