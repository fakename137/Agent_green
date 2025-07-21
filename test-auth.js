import 'dotenv/config';
// Test RugCheck Authentication
import { authenticateRugCheck } from './src/mastra/tools/memesol-tool.ts';

async function testAuthentication() {
  console.log('🔐 Testing RugCheck Authentication...\n');

  try {
    const result = await authenticateRugCheck();

    if (result.authenticated) {
      console.log('✅ Authentication Successful!');
      console.log(`Wallet: ${result.wallet}`);
      console.log(`Token: ${result.token.substring(0, 20)}...`);
    } else {
      console.log('❌ Authentication Failed');
      console.log(`Error: ${result.error}`);
      console.log('\n💡 To enable RugCheck authentication:');
      console.log('1. Set SOLANA_PRIVATE_KEY environment variable');
      console.log('2. Make sure the wallet has some SOL for gas fees');
      console.log('3. The wallet will sign "Sign-in to Rugcheck.xyz" message');
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testAuthentication();
