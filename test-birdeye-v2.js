// Test Birdeye API v2 endpoints
const BIRDEYE_API_URL = 'https://public-api.birdeye.so';

async function testBirdeyeV2() {
  console.log('🔍 Testing Birdeye API v2 Endpoints...\n');

  // Test 1: Get all tokens
  console.log('1️⃣ Testing all tokens endpoint...');
  try {
    const response = await fetch(`${BIRDEYE_API_URL}/public/tokenlist`);
    const data = await response.json();
    console.log(`   Status: ${response.status}`);
    console.log(`   Response keys: ${Object.keys(data)}`);
    if (data.data) {
      console.log(`   Tokens found: ${data.data.tokens?.length || 0}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  console.log('');

  // Test 2: Try different endpoint structure
  console.log('2️⃣ Testing alternative endpoint...');
  try {
    const response = await fetch(
      `${BIRDEYE_API_URL}/public/tokenlist?offset=0&limit=5`
    );
    const data = await response.json();
    console.log(`   Status: ${response.status}`);
    console.log(
      `   Response:`,
      JSON.stringify(data, null, 2).substring(0, 500)
    );
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  console.log('');

  // Test 3: Try with API key
  console.log('3️⃣ Testing with API key...');
  try {
    const response = await fetch(
      `${BIRDEYE_API_URL}/public/tokenlist?offset=0&limit=5`,
      {
        headers: {
          'X-API-KEY': 'test-key',
        },
      }
    );
    const data = await response.json();
    console.log(`   Status: ${response.status}`);
    console.log(
      `   Response:`,
      JSON.stringify(data, null, 2).substring(0, 500)
    );
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  console.log('');

  // Test 4: Try different base URL
  console.log('4️⃣ Testing alternative base URL...');
  try {
    const response = await fetch(
      `https://api.birdeye.so/public/tokenlist?offset=0&limit=5`
    );
    const data = await response.json();
    console.log(`   Status: ${response.status}`);
    console.log(
      `   Response:`,
      JSON.stringify(data, null, 2).substring(0, 500)
    );
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
}

testBirdeyeV2().catch(console.error);
