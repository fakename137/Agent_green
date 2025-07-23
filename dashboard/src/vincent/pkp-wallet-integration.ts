import { LitNodeClient } from '@lit-protocol/lit-node-client';
import {
  GoogleProvider,
  WebAuthnProvider,
  LitAuthClient,
} from '@lit-protocol/auth-helpers';
import { LitContracts } from '@lit-protocol/contracts-sdk';
import {
  AuthMethodScope,
  AuthMethodType,
  LitNetwork,
} from '@lit-protocol/constants';
import { ethers } from 'ethers';
import { PKPEthersWallet } from '@lit-protocol/pkp-ethers';

export interface PKPWallet {
  tokenId: string;
  publicKey: string;
  ethAddress: string;
  authMethod: {
    authMethodType: AuthMethodType;
    accessToken: string;
    authMethodId?: string;
    userPubkey?: string;
  };
  createdAt: number;
  isActive: boolean;
}

export interface AttestationResult {
  pkp: PKPWallet;
  litNodeClient: LitNodeClient;
  sessionSigs: Record<string, unknown>;
}

export class PKPWalletService {
  private litNodeClient: LitNodeClient;
  private litAuthClient: LitAuthClient;
  private litContracts: LitContracts;
  private provider: ethers.providers.JsonRpcProvider;
  private activePKPs: Map<string, PKPWallet> = new Map();

  constructor() {
    const network = (process.env.LIT_NETWORK as LitNetwork) || 'datil-dev';

    // Initialize with Chronicle testnet (latest for Lit v7)
    this.provider = new ethers.providers.JsonRpcProvider(
      'https://chain-rpc.litprotocol.com/http'
    );

    this.litNodeClient = new LitNodeClient({
      litNetwork: network,
      debug: process.env.NODE_ENV === 'development',
    });

    // this.litAuthClient = new LitAuthClient({
    //   litRelayConfig: {
    //     // No relay API key needed for v7 - direct to nodes
    //   },
    // });

    this.litContracts = new LitContracts({
      signer: new ethers.Wallet(
        process.env.LIT_PRIVATE_KEY || ethers.Wallet.createRandom().privateKey,
        this.provider
      ),
      network,
      debug: process.env.NODE_ENV === 'development',
    });
  }

  /**
   * Initialize the Lit Network connection
   */
  async initialize(): Promise<void> {
    await this.litNodeClient.connect();
    await this.litContracts.connect();
    console.log('[PKP] Lit Network connected successfully');
  }

  /**
   * Authenticate user with Google and create/mint PKP
   */
  async authenticateWithGoogle(): Promise<AttestationResult> {
    console.log('[PKP] Starting Google authentication...');

    // Clean up old PKPs first
    await this.cleanupOldPKPs();

    // Check if we're returning from a redirect
    if (
      typeof window !== 'undefined' &&
      isSignInRedirect(window.location.href)
    ) {
      const provider = getProviderFromUrl();
      if (provider) {
        await this.handleAuthRedirect(provider);
      }
    }

    // Initialize Google provider
    const googleProvider = this.litAuthClient.initProvider<GoogleProvider>(
      AuthMethodType.GoogleJwt,
      {
        clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
        redirectUri:
          typeof window !== 'undefined'
            ? `${window.location.origin}/auth/callback`
            : 'http://localhost:3000/auth/callback',
      }
    );

    // Authenticate with Google
    const authMethod = await googleProvider.authenticate();
    console.log('[PKP] Google authentication successful');

    // Fetch existing PKPs directly from contracts (v7 approach)
    const pkps = await this.fetchPKPsFromContracts(authMethod);

    let pkp: PKPWallet;

    if (pkps.length > 0) {
      // Deactivate all existing PKPs
      for (const existingPKP of pkps) {
        existingPKP.isActive = false;
        this.activePKPs.set(existingPKP.tokenId, existingPKP);
      }

      // Use the most recent PKP
      const latestPKP = pkps.sort((a, b) => b.createdAt - a.createdAt)[0];
      pkp = { ...latestPKP, isActive: true };
      console.log('[PKP] Reactivating latest PKP:', pkp.ethAddress);
    } else {
      // Mint new PKP directly through contracts (v7 approach)
      console.log('[PKP] Minting new PKP...');
      const mintResult = await this.mintPKPDirect(authMethod);

      pkp = {
        tokenId: mintResult.tokenId,
        publicKey: mintResult.publicKey,
        ethAddress: mintResult.ethAddress,
        authMethod,
        createdAt: Date.now(),
        isActive: true,
      };
      console.log('[PKP] New PKP minted:', pkp.ethAddress);
    }

    // Store active PKP
    this.activePKPs.set(pkp.tokenId, pkp);

    // Generate session signatures for the PKP
    const sessionSigs = await googleProvider.getSessionSigs({
      pkpPublicKey: pkp.publicKey,
      authMethod,
      sessionSigsParams: {
        chain: 'ethereum',
        expiration: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        resourceAbilityRequests: [
          {
            resource: `lit-pkp://${pkp.tokenId}`,
            ability: 'pkp-signing',
          },
        ],
      },
    });

    console.log('[PKP] Session signatures generated');

    return {
      pkp,
      litNodeClient: this.litNodeClient,
      sessionSigs,
    };
  }

  /**
   * Authenticate user with WebAuthn (Passkey) and create/mint PKP
   */
  async authenticateWithWebAuthn(): Promise<AttestationResult> {
    console.log('[PKP] Starting WebAuthn authentication...');

    // Clean up old PKPs first
    await this.cleanupOldPKPs();

    // Initialize WebAuthn provider
    const webAuthnProvider = this.litAuthClient.initProvider<WebAuthnProvider>(
      AuthMethodType.WebAuthn,
      {
        domain:
          typeof window !== 'undefined'
            ? window.location.hostname
            : 'localhost',
        name: 'MemeSol Trading Agent',
        origin:
          typeof window !== 'undefined'
            ? window.location.origin
            : 'http://localhost:3000',
      }
    );

    // Register or authenticate with WebAuthn
    let authMethod;
    try {
      // Try to authenticate first (user already has credentials)
      authMethod = await webAuthnProvider.authenticate();
    } catch (error) {
      // If authentication fails, register new credentials
      console.log('[PKP] Registering new WebAuthn credentials...');
      authMethod = await webAuthnProvider.register();
    }

    console.log('[PKP] WebAuthn authentication successful');

    // Fetch existing PKPs directly from contracts
    const pkps = await this.fetchPKPsFromContracts(authMethod);

    let pkp: PKPWallet;

    if (pkps.length > 0) {
      // Deactivate all existing PKPs
      for (const existingPKP of pkps) {
        existingPKP.isActive = false;
        this.activePKPs.set(existingPKP.tokenId, existingPKP);
      }

      // Use the most recent PKP
      const latestPKP = pkps.sort((a, b) => b.createdAt - a.createdAt)[0];
      pkp = { ...latestPKP, isActive: true };
      console.log('[PKP] Reactivating latest PKP:', pkp.ethAddress);
    } else {
      // Mint new PKP directly through contracts
      console.log('[PKP] Minting new PKP...');
      const mintResult = await this.mintPKPDirect(authMethod);

      pkp = {
        tokenId: mintResult.tokenId,
        publicKey: mintResult.publicKey,
        ethAddress: mintResult.ethAddress,
        authMethod,
        createdAt: Date.now(),
        isActive: true,
      };
      console.log('[PKP] New PKP minted:', pkp.ethAddress);
    }

    // Store active PKP
    this.activePKPs.set(pkp.tokenId, pkp);

    // Generate session signatures for the PKP
    const sessionSigs = await webAuthnProvider.getSessionSigs({
      pkpPublicKey: pkp.publicKey,
      authMethod,
      sessionSigsParams: {
        chain: 'ethereum',
        expiration: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        resourceAbilityRequests: [
          {
            resource: `lit-pkp://${pkp.tokenId}`,
            ability: 'pkp-signing',
          },
        ],
      },
    });

    console.log('[PKP] Session signatures generated');

    return {
      pkp,
      litNodeClient: this.litNodeClient,
      sessionSigs,
    };
  }

  /**
   * Handle authentication redirect callback
   */
  private async handleAuthRedirect(
    provider: GoogleProvider | WebAuthnProvider
  ): Promise<void> {
    try {
      await provider.authenticate();
      console.log('[PKP] Auth redirect handled successfully');

      // Clean up URL
      if (typeof window !== 'undefined') {
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );
      }
    } catch (error) {
      console.error('[PKP] Auth redirect failed:', error);
      throw error;
    }
  }

  /**
   * Fetch PKPs directly from contracts (v7 approach)
   */
  private async fetchPKPsFromContracts(authMethod: {
    authMethodType: AuthMethodType;
    authMethodId: string;
  }): Promise<PKPWallet[]> {
    try {
      const pkps =
        await this.litContracts.pkpNftContractUtils.read.getTokensByAuthMethod(
          authMethod.authMethodType,
          authMethod.authMethodId
        );

      return pkps.map(
        (pkp: {
          tokenId: string;
          publicKey: string;
          ethAddress: string;
          mintedAt?: number;
        }) => ({
          tokenId: pkp.tokenId,
          publicKey: pkp.publicKey,
          ethAddress: pkp.ethAddress,
          authMethod,
          createdAt: pkp.mintedAt || Date.now(),
          isActive: false,
        })
      );
    } catch (error) {
      console.error('[PKP] Failed to fetch PKPs from contracts:', error);
      return [];
    }
  }

  /**
   * Mint PKP directly through contracts (v7 approach)
   */
  private async mintPKPDirect(authMethod: {
    authMethodType: AuthMethodType;
    authMethodId: string;
    userPubkey?: string;
  }): Promise<{ tokenId: string; publicKey: string; ethAddress: string }> {
    try {
      const mintTx = await this.litContracts.pkpNftContractUtils.write.mint(
        authMethod.authMethodType,
        authMethod.authMethodId,
        authMethod.userPubkey || '0x',
        [AuthMethodScope.SignAnything],
        true // addPkpEthAddressAsPermittedAddress
      );

      const receipt = await mintTx.wait();
      const tokenId = receipt.events?.find(
        (e: { event: string }) => e.event === 'Transfer'
      )?.args?.tokenId;

      if (!tokenId) {
        throw new Error('Failed to get tokenId from mint transaction');
      }

      // Get PKP info
      const pkpInfo =
        await this.litContracts.pkpNftContractUtils.read.getTokenData(tokenId);

      return {
        tokenId: tokenId.toString(),
        publicKey: pkpInfo.publicKey,
        ethAddress: pkpInfo.ethAddress,
      };
    } catch (error) {
      console.error('[PKP] Failed to mint PKP directly:', error);
      throw error;
    }
  }

  /**
   * Clean up old inactive PKPs
   */
  private async cleanupOldPKPs(): Promise<void> {
    try {
      console.log('[PKP] Cleaning up old inactive PKPs...');

      const inactivePKPs = Array.from(this.activePKPs.values())
        .filter((pkp) => !pkp.isActive)
        .filter((pkp) => Date.now() - pkp.createdAt > 24 * 60 * 60 * 1000); // Older than 24 hours

      for (const pkp of inactivePKPs) {
        try {
          // Transfer PKP to burn address (effectively removing it)
          await this.litContracts.pkpNftContractUtils.write.transferFrom(
            pkp.ethAddress,
            '0x000000000000000000000000000000000000dEaD',
            pkp.tokenId
          );

          // Remove from active PKPs
          this.activePKPs.delete(pkp.tokenId);
          console.log(`[PKP] Cleaned up PKP: ${pkp.tokenId}`);
        } catch (error) {
          console.warn(`[PKP] Failed to cleanup PKP ${pkp.tokenId}:`, error);
        }
      }

      console.log(`[PKP] Cleaned up ${inactivePKPs.length} old PKPs`);
    } catch (error) {
      console.error('[PKP] PKP cleanup failed:', error);
    }
  }

  /**
   * Get all active PKPs
   */
  public getActivePKPs(): PKPWallet[] {
    return Array.from(this.activePKPs.values()).filter((pkp) => pkp.isActive);
  }

  /**
   * Deactivate a specific PKP
   */
  public async deactivatePKP(tokenId: string): Promise<void> {
    const pkp = this.activePKPs.get(tokenId);
    if (pkp) {
      pkp.isActive = false;
      this.activePKPs.set(tokenId, pkp);
      console.log(`[PKP] Deactivated PKP: ${tokenId}`);
    }
  }

  /**
   * Execute a Lit Action (Vincent Tool) with the authenticated PKP
   */
  async executeLitAction(
    pkp: PKPWallet,
    sessionSigs: Record<string, unknown>,
    litActionCode: string,
    jsParams: Record<string, unknown>
  ): Promise<unknown> {
    try {
      console.log('[PKP] Executing Lit Action...');

      const response = await this.litNodeClient.executeJs({
        sessionSigs,
        code: litActionCode,
        jsParams: {
          ...jsParams,
          pkpTokenId: pkp.tokenId,
          pkpPublicKey: pkp.publicKey,
          pkpEthAddress: pkp.ethAddress,
        },
      });

      console.log('[PKP] Lit Action executed successfully');
      return response;
    } catch (error) {
      console.error('[PKP] Lit Action execution failed:', error);
      throw error;
    }
  }

  /**
   * Get PKP wallet balance (for SOL and other tokens)
   */
  async getWalletBalance(pkp: PKPWallet): Promise<{
    sol: number;
    eth: number;
    tokens: Record<string, number>;
  }> {
    try {
      // Get ETH balance
      const ethBalance = await this.provider.getBalance(pkp.ethAddress);

      // For SOL balance, we'd need to call Solana RPC
      // This is a simplified version - in production you'd call actual Solana RPC
      const solBalance = 0; // Would be fetched from Solana

      return {
        sol: solBalance,
        eth: parseFloat(ethers.utils.formatEther(ethBalance)),
        tokens: {}, // Would include other token balances
      };
    } catch (error) {
      console.error('[PKP] Failed to get wallet balance:', error);
      throw error;
    }
  }

  /**
   * Disconnect and clean up
   */
  async disconnect(): Promise<void> {
    await this.litNodeClient.disconnect();
    console.log('[PKP] Disconnected from Lit Network');
  }
}

// Global instance
export const pkpWalletService = new PKPWalletService();

// Helper function to initialize PKP service
export async function initializePKPService(): Promise<void> {
  try {
    await pkpWalletService.initialize();
    console.log('[PKP] Service initialized successfully');
  } catch (error) {
    console.error('[PKP] Service initialization failed:', error);
    throw error;
  }
}
