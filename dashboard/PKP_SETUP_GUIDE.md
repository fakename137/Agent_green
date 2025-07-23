# 🔐 PKP Wallet Setup Guide for Vincent Integration

This guide will help you set up PKP (Programmable Key Pairs) wallet attestation for your MemeSol trading agent with Vincent.ai integration.

## 📋 Prerequisites

### 1. Required Accounts & API Keys

#### Lit Protocol Setup
1. **Lit Relay API Key**: 
   - Visit [Lit Protocol Dashboard](https://developer.litprotocol.com/)
   - Create an account and get your relay API key
   - Add to `.env.local`: `NEXT_PUBLIC_LIT_RELAY_API_KEY=your_key_here`

#### Google OAuth Setup (for Google auth method)
1. **Google Cloud Console**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing
   - Enable "Google+ API" and "OAuth2 API"
   - Create OAuth 2.0 credentials
   - Add authorized redirect URIs:
     - `http://localhost:3001/auth/callback`
     - `https://yourdomain.com/auth/callback`
   - Add to `.env.local`: `NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_client_id`

#### Polygon Mumbai Testnet Setup
1. **Get Mumbai MATIC**:
   - Visit [Mumbai Faucet](https://faucet.polygon.technology/)
   - Get test MATIC for PKP operations
   - Create a wallet for Lit Contracts operations
   - Add private key to `.env.local`: `LIT_PRIVATE_KEY=your_private_key`

### 2. Environment Configuration

Create `.env.local` file in the dashboard directory:

```bash
# Copy from .env.local.example
cp .env.local.example .env.local
```

Fill in the required values:

```bash
# Vincent PKP Wallet Configuration
NEXT_PUBLIC_LIT_RELAY_API_KEY=lit_relay_api_key_from_lit_dashboard
NEXT_PUBLIC_GOOGLE_CLIENT_ID=google_oauth_client_id

# Private key for Lit Contracts (Mumbai testnet)
LIT_PRIVATE_KEY=your_mumbai_testnet_private_key

# Environment
NEXT_PUBLIC_ENVIRONMENT=development
NEXT_PUBLIC_LIT_NETWORK=datil-dev
```

## 🚀 Step-by-Step Setup

### Step 1: Install Dependencies

```bash
cd dashboard
npm install
```

### Step 2: Configure Authentication

#### Option A: Google Authentication
1. Set up Google OAuth credentials (see prerequisites)
2. Test authentication flow:
   ```bash
   npm run dev
   # Visit http://localhost:3001/auth
   # Click "Continue with Google"
   ```

#### Option B: Passkey Authentication  
1. Ensure you're using HTTPS in production
2. Test passkey flow:
   ```bash
   npm run dev
   # Visit http://localhost:3001/auth
   # Click "Continue with Passkey"
   ```

### Step 3: Test PKP Creation

1. **Start the development server**:
   ```bash
   npm run dev
   ```

2. **Navigate to authentication**:
   - Go to `http://localhost:3001/auth`
   - Choose authentication method
   - Complete PKP wallet creation

3. **Verify PKP creation**:
   - Check browser console for PKP address
   - Verify tool deployment logs
   - Test basic functionality

### Step 4: Deploy Trading Tool

1. **Automatic deployment** happens after PKP creation
2. **Verify deployment**:
   - Check console logs for tool ID
   - Verify IPFS hash generation
   - Test tool execution

## 🔧 Technical Implementation

### PKP Wallet Service Architecture

```typescript
// PKP Authentication Flow
1. User chooses auth method (Google/Passkey)
2. LitAuthClient authenticates user
3. Check for existing PKPs or mint new one
4. Generate session signatures
5. Deploy MemeSol trading tool as Lit Action
6. Store deployment info for investor dashboard
```

### Key Components

#### 1. PKP Wallet Integration (`pkp-wallet-integration.ts`)
- **Authentication**: Google OAuth, WebAuthn passkeys
- **PKP Management**: Create, mint, manage PKPs
- **Session Management**: Generate and manage session signatures
- **Lit Action Execution**: Execute Vincent tools

#### 2. Vincent Tool Deployment (`vincent-tool-deployment.ts`)
- **Tool Deployment**: Deploy MemeSol trading as Lit Action
- **IPFS Storage**: Store tool code on IPFS
- **Trade Execution**: Execute trades via PKP signing
- **Policy Management**: Manage spending limits and policies

#### 3. Authentication UI (`/auth/page.tsx`)
- **Multi-step flow**: Auth → Deploy → Complete
- **Error handling**: Comprehensive error states
- **Progress tracking**: Clear step indicators
- **Success states**: Deployment confirmation

## 🔒 Security Features

### PKP Security Model
- **Non-custodial**: Users control their own keys
- **Programmable**: Conditions can be attached to key usage
- **Multi-auth**: Support for multiple authentication methods
- **Session-based**: Temporary signatures for operations

### Vincent Policy Enforcement
- **Spending Limits**: Daily, weekly, monthly caps
- **Risk Controls**: Agent score requirements, risk categories
- **Emergency Stops**: Instant trading halt capability
- **Audit Trail**: Complete transaction logging

## 🧪 Testing

### Unit Testing
```bash
# Test PKP wallet creation
npm run test:pkp

# Test tool deployment
npm run test:deployment

# Test authentication flow
npm run test:auth
```

### Integration Testing
```bash
# Test full flow with testnet
npm run test:integration

# Test trade execution
npm run test:trading
```

### Manual Testing Checklist

- [ ] Google authentication works
- [ ] Passkey authentication works  
- [ ] PKP wallet created successfully
- [ ] Tool deployment completes
- [ ] Spending limits enforced
- [ ] Emergency stop functions
- [ ] Session persistence
- [ ] Error handling graceful

## 🚨 Troubleshooting

### Common Issues

#### 1. Lit Network Connection Failed
```bash
Error: Failed to connect to Lit Network
```
**Solution**:
- Check internet connection
- Verify `NEXT_PUBLIC_LIT_NETWORK=datil-dev`
- Ensure Mumbai testnet is accessible
- Check Lit Protocol status page

#### 2. Google Authentication Fails
```bash
Error: Google authentication failed
```
**Solution**:
- Verify Google OAuth credentials
- Check redirect URI configuration
- Ensure Google APIs are enabled
- Check browser console for detailed errors

#### 3. PKP Minting Fails
```bash
Error: Failed to mint PKP
```
**Solution**:
- Check Mumbai MATIC balance
- Verify private key has funds
- Check Lit Contracts connectivity
- Review network configuration

#### 4. Tool Deployment Fails
```bash
Error: Tool deployment failed
```
**Solution**:
- Verify IPFS connectivity
- Check session signatures validity
- Review tool code syntax
- Ensure PKP has proper permissions

### Debug Mode

Enable debug mode for detailed logging:

```bash
# In .env.local
NEXT_PUBLIC_DEBUG=true
LIT_DEBUG=true
```

### Logs to Check

1. **Browser Console**: Client-side errors and flow
2. **Server Logs**: API errors and PKP operations
3. **Network Tab**: API calls and responses
4. **Lit Network Logs**: PKP and session signature issues

## 🔄 Production Deployment

### Environment Differences

#### Development
- Uses `datil-dev` Lit network
- Mumbai testnet for transactions
- Local testing environment

#### Production  
- Uses `datil` Lit network
- Mainnet for actual transactions
- Production domain configuration

### Security Checklist

- [ ] Environment variables secured
- [ ] HTTPS enforced
- [ ] API keys rotated
- [ ] Error messages sanitized
- [ ] Rate limiting implemented
- [ ] Monitoring configured
- [ ] Backup procedures tested

### Monitoring

Set up monitoring for:
- PKP creation success rate
- Tool deployment failures
- Trade execution errors
- Authentication failures
- Session expiration issues

## 📚 Additional Resources

### Documentation
- [Lit Protocol Docs](https://developer.litprotocol.com/)
- [Vincent.ai Documentation](https://docs.heyvincent.ai/)
- [PKP Authentication Guide](https://developer.litprotocol.com/sdk/authentication)

### Examples
- [Lit Protocol Examples](https://github.com/LitProtocol/js-sdk/tree/main/packages/example)
- [Vincent Tool Examples](https://github.com/LIT-Protocol/Vincent/tree/main/packages/apps)

### Support
- [Lit Protocol Discord](https://discord.gg/litprotocol)
- [Vincent.ai Support](https://heyvincent.ai/support)
- [GitHub Issues](https://github.com/your-repo/issues)

---

**⚠️ Important Notes:**
- Always test on testnet before production
- Keep private keys secure and never commit them
- Monitor gas costs and optimize accordingly
- Regular security audits recommended
- Backup all critical configuration
