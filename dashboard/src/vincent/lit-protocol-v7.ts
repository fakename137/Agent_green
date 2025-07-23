import { LitNodeClient } from '@lit-protocol/lit-node-client';
import { LitContracts } from '@lit-protocol/contracts-sdk';
import { LitActionResource, LitPKPResource } from '@lit-protocol/auth-helpers';
import { 
  AUTH_METHOD_SCOPE, 
  AUTH_METHOD_TYPE, 
  LIT_ABILITY,
  LitNetwork 
} from '@lit-protocol/constants';
import { ethers } from 'ethers';
import bs58 from 'bs58';

// Types
export interface MintedPkp {
  tokenId: string;
  publicKey: string;
  ethAddress: string;
}

export interface GoogleCredentialResponse {
  credential: string;
  clientId: string;
}

// Lit Action for Google Authentication
const googleAuthLitAction = `
(async () => {
  console.log("🔄 Starting Lit Action execution for Google auth...");

  const GOOGLE_AUTH_METHOD_TYPE = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes(
      \`MemeSol Trading Agent. Client ID: \${googleClientId}\`
    )
  );
  console.log("✅ Generated auth method type:", GOOGLE_AUTH_METHOD_TYPE);

  try {
    // Verify the token with Google
    console.log("🔄 Verifying Google credential...");
    const response = await fetch(
      \`https://oauth2.googleapis.com/tokeninfo?id_token=\${googleCredential}\`
    );

    if (!response.ok) {
      console.log("❌ Failed to verify token with Google");
      return Lit.Actions.setResponse({
        response: "false",
        reason: "Invalid Google credential",
      });
    }

    const tokenInfo = await response.json();
    console.log("✅ Token verified with Google. User ID:", tokenInfo.sub);

    // Verify audience matches our client ID
    if (tokenInfo.aud !== googleClientId) {
      console.log("❌ Invalid audience:", tokenInfo.aud);
      return Lit.Actions.setResponse({
        response: "false",
        reason: "Invalid audience in Google credential",
      });
    }
    console.log("✅ Audience verified");

    // Check if the auth method is permitted for this PKP
    console.log("🔄 Checking PKP authorization...");
    const usersAuthMethodId = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(\`google:\${tokenInfo.sub}\`)
    );
    console.log("Generated auth method ID:", usersAuthMethodId);

    const isPermitted = await Lit.Actions.isPermittedAuthMethod({
      tokenId: pkpTokenId,
      authMethodType: GOOGLE_AUTH_METHOD_TYPE,
      userId: ethers.utils.arrayify(usersAuthMethodId),
    });

    if (!isPermitted) {
      console.log("❌ User not authorized for this PKP");
      return Lit.Actions.setResponse({
        response: "false",
        reason: "Google user is not authorized to use this PKP",
      });
    }
    console.log("✅ User is authorized for this PKP");

    console.log("✅ All checks passed successfully");
    return Lit.Actions.setResponse({ response: "true" });
  } catch (error) {
    console.log("❌ Error in Lit Action:", error.message);
    return Lit.Actions.setResponse({
      response: "false",
      reason: \`Error: \${error.message}\`,
    });
  }
})();
`;

export class LitProtocolV7Service {
  private litNodeClient: LitNodeClient | null = null;
  private litContracts: LitContracts | null = null;
  private ethersSigner: ethers.Signer | null = null;

  constructor(private network: LitNetwork = 'datil-test') {}

  /**
   * Initialize Lit Node Client
   */
  async initializeLitNodeClient(): Promise<LitNodeClient> {
    if (this.litNodeClient) {
      return this.litNodeClient;
    }

    console.log('[Lit] Initializing Lit Node Client...');
    this.litNodeClient = new LitNodeClient({
      litNetwork: this.network,
      debug: true,
    });

    await this.litNodeClient.connect();
    console.log('[Lit] ✅ Connected to Lit Network');
    
    return this.litNodeClient;
  }

  /**
   * Connect to Ethereum account (for PKP operations)
   */
  async connectEthereumAccount(): Promise<ethers.Signer> {
    if (this.ethersSigner) {
      return this.ethersSigner;
    }

    console.log('[Lit] Connecting to Ethereum account...');
    
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      // Browser environment with MetaMask
      const provider = new ethers.providers.Web3Provider((window as any).ethereum);
      await provider.send('eth_requestAccounts', []);
      this.ethersSigner = provider.getSigner();
    } else {
      // Server environment or no MetaMask - use private key
      const privateKey = process.env.LIT_PRIVATE_KEY;
      if (!privateKey) {
        throw new Error('No Ethereum account available. Install MetaMask or set LIT_PRIVATE_KEY');
      }
      
      const provider = new ethers.providers.JsonRpcProvider(
        this.network === 'datil-test' 
          ? 'https://chain-rpc.litprotocol.com/http' 
          : 'https://rpc-mumbai.polygon.technology/'
      );
      this.ethersSigner = new ethers.Wallet(privateKey, provider);
    }

    console.log('[Lit] ✅ Connected to Ethereum account');
    return this.ethersSigner;
  }

  /**
   * Initialize Lit Contracts
   */
  async initializeLitContracts(): Promise<LitContracts> {
    if (this.litContracts) {
      return this.litContracts;
    }

    if (!this.ethersSigner) {
      await this.connectEthereumAccount();
    }

    console.log('[Lit] Initializing Lit Contracts...');
    this.litContracts = new LitContracts({
      signer: this.ethersSigner!,
      network: this.network,
    });

    await this.litContracts.connect();
    console.log('[Lit] ✅ Connected to Lit Contracts');
    
    return this.litContracts;
  }

  /**
   * Generate Google auth method metadata
   */
  getGoogleAuthMethodMetadata(credentialResponse: GoogleCredentialResponse) {
    // Decode the JWT to get user info
    const payload = JSON.parse(
      Buffer.from(credentialResponse.credential.split('.')[1], 'base64').toString()
    );

    const authMethodType = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(
        `MemeSol Trading Agent. Client ID: ${credentialResponse.clientId}`
      )
    );

    const authMethodId = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(`google:${payload.sub}`)
    );

    return {
      authMethodType,
      authMethodId,
      userInfo: {
        sub: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
      },
    };
  }

  /**
   * Mint a new PKP with Google authentication
   */
  async mintPkpWithGoogle(credentialResponse: GoogleCredentialResponse): Promise<MintedPkp> {
    try {
      console.log('[Lit] Starting PKP minting with Google auth...');
      
      // Initialize services
      await this.connectEthereumAccount();
      const litContracts = await this.initializeLitContracts();
      
      // Get auth method metadata
      const authMethodMetadata = this.getGoogleAuthMethodMetadata(credentialResponse);
      console.log('[Lit] Auth Method Metadata:', authMethodMetadata);

      // Get PKP mint cost
      console.log('[Lit] Getting PKP mint cost...');
      const pkpMintCost = await litContracts.pkpNftContract.read.mintCost();
      console.log('[Lit] PKP mint cost:', ethers.utils.formatEther(pkpMintCost), 'ETH');

      // Calculate IPFS CID for Lit Action
      console.log('[Lit] Calculating IPFS CID for Lit Action...');
      const { create } = await import('ipfs-only-hash');
      const litActionIpfsCid = await create(googleAuthLitAction);
      console.log('[Lit] Lit Action IPFS CID:', litActionIpfsCid);

      // Mint PKP with auth methods
      console.log('[Lit] Minting PKP...');
      const tx = await litContracts.pkpHelperContract.write.mintNextAndAddAuthMethods(
        AUTH_METHOD_TYPE.LitAction, // keyType
        [AUTH_METHOD_TYPE.LitAction, authMethodMetadata.authMethodType], // permittedAuthMethodTypes
        [
          // IPFS CID of the Lit Action for Google auth
          `0x${Buffer.from(bs58.decode(litActionIpfsCid)).toString('hex')}`,
          // Hash of the user's Google auth credential
          authMethodMetadata.authMethodId,
        ], // permittedAuthMethodIds
        ['0x', '0x'], // permittedAuthMethodPubkeys
        [
          // Allow the Lit Action to sign anything
          [AUTH_METHOD_SCOPE.SignAnything],
          // Google auth method requires Lit Action
          [AUTH_METHOD_SCOPE.NoPermissions],
        ], // permittedAuthMethodScopes
        true, // addPkpEthAddressAsPermittedAddress
        true, // sendPkpToItself
        { value: pkpMintCost } // mintCost
      );

      const receipt = await tx.wait();
      console.log('[Lit] ✅ PKP minted successfully');

      // Extract PKP info from receipt
      const pkpInfo = await this.getPkpInfoFromMintReceipt(receipt, litContracts);
      
      console.log('[Lit] PKP Info:', {
        tokenId: pkpInfo.tokenId,
        publicKey: pkpInfo.publicKey,
        ethAddress: pkpInfo.ethAddress,
      });

      return pkpInfo;
    } catch (error) {
      console.error('[Lit] PKP minting failed:', error);
      throw error;
    }
  }

  /**
   * Get PKP session signatures for authenticated operations
   */
  async getPkpSessionSigs(
    credentialResponse: GoogleCredentialResponse,
    mintedPkp: MintedPkp
  ): Promise<any> {
    try {
      console.log('[Lit] Getting PKP session signatures...');
      
      // Initialize Lit Node Client
      const litNodeClient = await this.initializeLitNodeClient();
      
      // Get or mint capacity credit (required for session sigs)
      const capacityTokenId = await this.ensureCapacityCredit();
      
      // Get capacity delegation auth sig
      const capacityDelegationAuthSig = await this.getCapacityDelegationAuthSig(
        litNodeClient,
        mintedPkp,
        capacityTokenId
      );

      console.log('[Lit] Generating session signatures...');
      const sessionSignatures = await litNodeClient.getPkpSessionSigs({
        pkpPublicKey: mintedPkp.publicKey,
        capabilityAuthSigs: [capacityDelegationAuthSig],
        litActionCode: Buffer.from(googleAuthLitAction).toString('base64'),
        jsParams: {
          googleCredential: credentialResponse.credential,
          googleClientId: credentialResponse.clientId,
          pkpTokenId: mintedPkp.tokenId,
        },
        resourceAbilityRequests: [
          {
            resource: new LitPKPResource('*'),
            ability: LIT_ABILITY.PKPSigning,
          },
          {
            resource: new LitActionResource('*'),
            ability: LIT_ABILITY.LitActionExecution,
          },
        ],
        expiration: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(), // 24 hours
      });

      console.log('[Lit] ✅ Session signatures generated');
      return sessionSignatures;
    } catch (error) {
      console.error('[Lit] Session signature generation failed:', error);
      throw error;
    }
  }

  /**
   * Execute a Lit Action with the PKP
   */
  async executeLitAction(
    pkp: MintedPkp,
    sessionSigs: any,
    litActionCode: string,
    jsParams: Record<string, any>
  ): Promise<any> {
    try {
      const litNodeClient = await this.initializeLitNodeClient();
      
      const response = await litNodeClient.executeJs({
        sessionSigs,
        code: litActionCode,
        jsParams: {
          ...jsParams,
          pkpTokenId: pkp.tokenId,
          pkpPublicKey: pkp.publicKey,
          pkpEthAddress: pkp.ethAddress,
        },
      });

      return response;
    } catch (error) {
      console.error('[Lit] Lit Action execution failed:', error);
      throw error;
    }
  }

  /**
   * Extract PKP info from mint receipt
   */
  private async getPkpInfoFromMintReceipt(
    receipt: ethers.ContractReceipt,
    litContracts: LitContracts
  ): Promise<MintedPkp> {
    // Find the Transfer event for the PKP NFT
    const transferEvent = receipt.events?.find(
      (event) => 
        event.address === litContracts.pkpNftContract.address &&
        event.topics[0] === ethers.utils.id('Transfer(address,address,uint256)')
    );

    if (!transferEvent || !transferEvent.topics[3]) {
      throw new Error('PKP token ID not found in transaction receipt');
    }

    const tokenId = ethers.BigNumber.from(transferEvent.topics[3]).toString();
    
    // Get PKP public key and ETH address
    const publicKey = await litContracts.pkpNftContract.read.getPubkey(tokenId);
    const ethAddress = await litContracts.pkpNftContract.read.getEthAddress(tokenId);

    return {
      tokenId,
      publicKey,
      ethAddress,
    };
  }

  /**
   * Ensure capacity credit exists for session signatures
   */
  private async ensureCapacityCredit(): Promise<string> {
    // Check if we have a capacity credit token ID in env
    const existingTokenId = process.env.NEXT_PUBLIC_LIT_CAPACITY_CREDIT_TOKEN_ID;
    
    if (existingTokenId) {
      console.log('[Lit] Using existing capacity credit:', existingTokenId);
      return existingTokenId;
    }

    // Mint new capacity credit
    console.log('[Lit] Minting new capacity credit...');
    const litContracts = await this.initializeLitContracts();
    
    const tx = await litContracts.rateLimitNftContract.write.mint(
      128, // requestsPerKilosecond
      { value: await litContracts.rateLimitNftContract.read.calculateCost(128) }
    );
    
    const receipt = await tx.wait();
    
    // Extract token ID from receipt
    const transferEvent = receipt.events?.find(
      (event) => event.topics[0] === ethers.utils.id('Transfer(address,address,uint256)')
    );
    
    if (!transferEvent || !transferEvent.topics[3]) {
      throw new Error('Capacity credit token ID not found in transaction receipt');
    }

    const tokenId = ethers.BigNumber.from(transferEvent.topics[3]).toString();
    console.log('[Lit] ✅ Minted capacity credit:', tokenId);
    
    return tokenId;
  }

  /**
   * Get capacity delegation auth signature
   */
  private async getCapacityDelegationAuthSig(
    litNodeClient: LitNodeClient,
    mintedPkp: MintedPkp,
    capacityTokenId: string
  ): Promise<any> {
    if (!this.ethersSigner) {
      throw new Error('Ethereum signer not initialized');
    }

    const { createSiweMessage, generateAuthSig } = await import('@lit-protocol/auth-helpers');
    
    const blockHash = await litNodeClient.getLatestBlockhash();
    const message = await createSiweMessage({
      uri: 'https://localhost/login',
      expiration: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(), // 24 hours
      resources: [
        {
          resource: new LitPKPResource(mintedPkp.tokenId),
          ability: LIT_ABILITY.PKPSigning,
        },
      ],
      walletAddress: await this.ethersSigner.getAddress(),
      nonce: blockHash,
      litNodeClient,
    });

    const authSig = await generateAuthSig({
      signer: this.ethersSigner,
      toSign: message,
    });

    return authSig;
  }

  /**
   * Disconnect from Lit Network
   */
  async disconnect(): Promise<void> {
    if (this.litNodeClient) {
      await this.litNodeClient.disconnect();
      this.litNodeClient = null;
      console.log('[Lit] Disconnected from Lit Network');
    }
  }
}

// Global instance
export const litProtocolService = new LitProtocolV7Service();

// Helper function to initialize the service
export async function initializeLitService(): Promise<void> {
  try {
    await litProtocolService.initializeLitNodeClient();
    console.log('[Lit] Service initialized successfully');
  } catch (error) {
    console.error('[Lit] Service initialization failed:', error);
    throw error;
  }
}
