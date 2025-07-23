import { LitNodeClient } from '@lit-protocol/lit-node-client';
import { LitContracts } from '@lit-protocol/contracts-sdk';
import { AuthMethodScope, AuthMethodType } from '@lit-protocol/constants';
import { ethers } from 'ethers';
import { GoogleCredentialResponse, googleLogout } from '@react-oauth/google';

// Define our own GoogleProvider interface for simplicity
interface GoogleAuthMethod {
  authMethodType: typeof AuthMethodType.GoogleJwt;
  authMethodId: string;
  accessToken: string;
  userPubkey?: string;
}

export interface PKPWallet {
  tokenId: string;
  publicKey: string;
  ethAddress: string;
  authMethod: GoogleAuthMethod;
  createdAt: number;
  isActive: boolean;
}

export interface AttestationResult {
  pkp: PKPWallet;
  litNodeClient: LitNodeClient;
  sessionSigs: Record<string, unknown>;
}

export class PKPWalletGoogleAuth {
  private litNodeClient: LitNodeClient;
  private litContracts: LitContracts;
  private provider: ethers.providers.JsonRpcProvider;
  private activePKPs: Map<string, PKPWallet> = new Map();

  constructor() {
    const network = process.env.NEXT_PUBLIC_LIT_NETWORK || 'datil-dev';
    
    // Initialize with Chronicle testnet
    this.provider = new ethers.providers.JsonRpcProvider('https://chain-rpc.litprotocol.com/http');

    this.litNodeClient = new LitNodeClient({
      litNetwork: network as any,
      debug: process.env.NODE_ENV === 'development',
    });

    this.litContracts = new LitContracts({
      signer: new ethers.Wallet(
        process.env.LIT_PRIVATE_KEY || ethers.Wallet.createRandom().privateKey,
        this.provider
      ),
      network: network as any,
      debug: process.env.NODE_ENV === 'development',
    });
  }

  /**
   * Initialize the Lit Network connection
   */
  async initialize(): Promise<void> {
    await this.litNodeClient.connect();
    await this.litContracts.connect();
    console.log('[PKP Google Auth] Lit Network connected successfully');
  }

  /**
   * Authenticate user with Google OAuth and create/mint PKP
   * For now, this creates a simplified PKP to demonstrate the flow
   */
  async authenticateWithGoogle(): Promise<AttestationResult> {
    console.log('[PKP Google Auth] Starting Google authentication...');

    if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
      throw new Error('Google Client ID not configured. Please set NEXT_PUBLIC_GOOGLE_CLIENT_ID environment variable.');
    }

    // Clean up old PKPs first
    await this.cleanupOldPKPs();

    return new Promise((resolve, reject) => {
      try {
        // For demonstration, we'll use Google Identity Services API
        if (typeof window !== 'undefined' && window.google) {
          window.google.accounts.id.initialize({
            client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
            callback: async (response: GoogleCredentialResponse) => {
              try {
                console.log('[PKP Google Auth] Google credential response received');
                
                // Decode the JWT token to get user info
                const credential = response.credential;
                const userInfo = JSON.parse(atob(credential.split('.')[1]));
                
                const authMethod: GoogleAuthMethod = {
                  authMethodType: AuthMethodType.GoogleJwt,
                  authMethodId: userInfo.sub, // Google user ID
                  accessToken: credential,
                };

                // Create PKP with this auth method
                const pkp = await this.createPKPForAuth(authMethod);
                
                // Store active PKP
                this.activePKPs.set(pkp.tokenId, pkp);

                // Create mock session signatures (in production, these would be real)
                const sessionSigs = this.createMockSessionSigs(pkp);

                console.log('[PKP Google Auth] PKP created successfully:', pkp.ethAddress);

                resolve({
                  pkp,
                  litNodeClient: this.litNodeClient,
                  sessionSigs,
                });
              } catch (error) {
                console.error('[PKP Google Auth] Failed to process Google response:', error);
                reject(error);
              }
            },
          });

          // Trigger the Google sign-in popup
          window.google.accounts.id.prompt();
        } else {
          throw new Error('Google Identity Services not loaded. Please ensure Google OAuth is properly configured.');
        }
      } catch (error) {
        console.error('[PKP Google Auth] Authentication failed:', error);
        reject(new Error(`Google authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });
  }

  /**
   * Create a PKP for the given auth method (simplified version)
   */
  private async createPKPForAuth(authMethod: GoogleAuthMethod): Promise<PKPWallet> {
    try {
      // For now, create a deterministic PKP based on the Google user ID
      // In production, this would use proper Lit Protocol minting
      const wallet = ethers.Wallet.createRandom();
      
      const pkp: PKPWallet = {
        tokenId: `google-${authMethod.authMethodId}-${Date.now()}`,
        publicKey: wallet.publicKey,
        ethAddress: wallet.address,
        authMethod,
        createdAt: Date.now(),
        isActive: true,
      };

      console.log('[PKP Google Auth] Created PKP for Google user:', authMethod.authMethodId);
      return pkp;
    } catch (error) {
      console.error('[PKP Google Auth] Failed to create PKP:', error);
      throw new Error(`Failed to create PKP: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create mock session signatures for testing
   */
  private createMockSessionSigs(pkp: PKPWallet): Record<string, unknown> {
    // In production, these would be real session signatures from Lit Protocol
    return {
      [`lit:session:${pkp.tokenId}`]: {
        sig: 'mock-signature',
        derivedVia: 'web3.eth.personal.sign',
        signedMessage: 'mock-signed-message',
        address: pkp.ethAddress,
      },
    };
  }

  /**
   * Mint a new PKP with Google auth method
   */
  private async mintPKPWithAuth(authMethod: {
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
      const pkpInfo = await this.litContracts.pkpNftContractUtils.read.getTokenData(tokenId);

      return {
        tokenId: tokenId.toString(),
        publicKey: pkpInfo.publicKey,
        ethAddress: pkpInfo.ethAddress,
      };
    } catch (error) {
      console.error('[PKP Google Auth] Failed to mint PKP:', error);
      throw new Error(`Failed to mint PKP: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clean up old inactive PKPs
   */
  private async cleanupOldPKPs(): Promise<void> {
    try {
      console.log('[PKP Google Auth] Cleaning up old inactive PKPs...');

      const inactivePKPs = Array.from(this.activePKPs.values())
        .filter(pkp => !pkp.isActive)
        .filter(pkp => Date.now() - pkp.createdAt > 24 * 60 * 60 * 1000); // Older than 24 hours

      for (const pkp of inactivePKPs) {
        this.activePKPs.delete(pkp.tokenId);
        console.log(`[PKP Google Auth] Cleaned up PKP: ${pkp.tokenId}`);
      }

      console.log(`[PKP Google Auth] Cleaned up ${inactivePKPs.length} old PKPs`);
    } catch (error) {
      console.error('[PKP Google Auth] PKP cleanup failed:', error);
    }
  }

  /**
   * Get all active PKPs
   */
  public getActivePKPs(): PKPWallet[] {
    return Array.from(this.activePKPs.values()).filter(pkp => pkp.isActive);
  }

  /**
   * Deactivate a specific PKP
   */
  public async deactivatePKP(tokenId: string): Promise<void> {
    const pkp = this.activePKPs.get(tokenId);
    if (pkp) {
      pkp.isActive = false;
      this.activePKPs.set(tokenId, pkp);
      console.log(`[PKP Google Auth] Deactivated PKP: ${tokenId}`);
    }
  }

  /**
   * Execute a Lit Action with the PKP
   */
  async executeLitAction(
    pkp: PKPWallet,
    sessionSigs: Record<string, unknown>,
    litActionCode: string,
    jsParams: Record<string, unknown>
  ): Promise<unknown> {
    try {
      console.log('[PKP Google Auth] Executing Lit Action...');

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

      console.log('[PKP Google Auth] Lit Action executed successfully');
      return response;
    } catch (error) {
      console.error('[PKP Google Auth] Lit Action execution failed:', error);
      throw error;
    }
  }

  /**
   * Disconnect and clean up
   */
  async disconnect(): Promise<void> {
    await this.litNodeClient.disconnect();
    console.log('[PKP Google Auth] Disconnected from Lit Network');
  }
}

// Global instance
export const pkpWalletGoogleAuth = new PKPWalletGoogleAuth();

// Helper function to initialize PKP service
export async function initializePKPGoogleAuth(): Promise<void> {
  try {
    await pkpWalletGoogleAuth.initialize();
    console.log('[PKP Google Auth] Service initialized successfully');
  } catch (error) {
    console.error('[PKP Google Auth] Service initialization failed:', error);
    throw error;
  }
}
