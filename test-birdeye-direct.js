// Direct test of Birdeye API endpoints
const BIRDEYE_API_URL = 'https://public-api.birdeye.so';

async function testBirdeyeEndpoints() {
  console.log('🔍 Testing Birdeye API Endpoints Directly...\n');

  // Test 1: Get trending tokens
  console.log('1️⃣ Testing trending tokens endpoint...');
  try {
    const response = await fetch(
      `${BIRDEYE_API_URL}/public/tokenlist?sort_by=v24hUSD&sort_type=desc&offset=0&limit=5`
    );
    const data = await response.json();
    console.log(`   Status: ${response.status}`);
    console.log(`   Tokens found: ${data.data?.tokens?.length || 0}`);
    if (data.data?.tokens?.length > 0) {
      console.log(
        `   First token: ${data.data.tokens[0].symbol} - ${data.data.tokens[0].name}`
      );
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  console.log('');

  // Test 2: Search for BONK
  console.log('2️⃣ Testing search endpoint for BONK...');
  try {
    const response = await fetch(
      `${BIRDEYE_API_URL}/public/tokenlist?search=BONK&offset=0&limit=5`
    );
    const data = await response.json();
    console.log(`   Status: ${response.status}`);
    console.log(`   Tokens found: ${data.data?.tokens?.length || 0}`);
    if (data.data?.tokens?.length > 0) {
      console.log(
        `   First token: ${data.data.tokens[0].symbol} - ${data.data.tokens[0].name}`
      );
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  console.log('');

  // Test 3: Get specific token data (using a known address)
  console.log('3️⃣ Testing specific token endpoint...');
  try {
    // BONK token address
    const bonkAddress = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
    const response = await fetch(
      `${BIRDEYE_API_URL}/public/token?address=${bonkAddress}`
    );
    const data = await response.json();
    console.log(`   Status: ${response.status}`);
    console.log(`   Token data: ${data.data ? 'Found' : 'Not found'}`);
    if (data.data) {
      console.log(`   Token: ${data.data.symbol} - ${data.data.name}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  console.log('');

  // Test 4: Get price data
  console.log('4️⃣ Testing price endpoint...');
  try {
    const bonkAddress = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
    const response = await fetch(
      `${BIRDEYE_API_URL}/public/price?address=${bonkAddress}`
    );
    const data = await response.json();
    console.log(`   Status: ${response.status}`);
    console.log(`   Price data: ${data.data ? 'Found' : 'Not found'}`);
    if (data.data) {
      console.log(`   Price: $${data.data.value}`);
      console.log(`   Market Cap: $${data.data.marketCap}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
}

testBirdeyeEndpoints().catch(console.error);
