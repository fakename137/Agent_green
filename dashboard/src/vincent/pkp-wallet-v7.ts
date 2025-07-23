import { LitNodeClient } from '@lit-protocol/lit-node-client';
import { LitContracts } from '@lit-protocol/contracts-sdk';
import { ethers } from 'ethers';

export interface PKPWallet {
  tokenId: string;
  publicKey: string;
  ethAddress: string;
  createdAt: number;
  isActive: boolean;
}

export interface AttestationResult {
  pkp: PKPWallet;
  litNodeClient: LitNodeClient;
}

export class PKPWalletServiceV7 {
  private litNodeClient: LitNodeClient;
  private litContracts: LitContracts;
  private provider: ethers.providers.JsonRpcProvider;
  private activePKPs: Map<string, PKPWallet> = new Map();

  constructor() {
    const network = process.env.LIT_NETWORK || 'datil-dev';
    
    // Initialize with Chronicle testnet (latest for Lit v7)
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
    console.log('[PKP] Lit Network connected successfully');
  }

  /**
   * Create a simple PKP using basic authentication
   */
  async createSimplePKP(authId?: string): Promise<AttestationResult> {
    console.log('[PKP] Creating simple PKP...');
    
    // Clean up old PKPs first
    await this.cleanupOldPKPs();
    
    try {
      // For demonstration, create a PKP with a simple auth method
      const authMethodId = authId || ethers.utils.id(`user-${Date.now()}`);
      
      // Check if PKP already exists for this auth
      const existingPKPs = await this.fetchExistingPKPs(authMethodId);
      
      let pkp: PKPWallet;
      
      if (existingPKPs.length > 0) {
        // Deactivate all existing PKPs
        for (const existingPKP of existingPKPs) {
          existingPKP.isActive = false;
          this.activePKPs.set(existingPKP.tokenId, existingPKP);
        }
        
        // Use the most recent PKP
        const latestPKP = existingPKPs.sort((a, b) => b.createdAt - a.createdAt)[0];
        pkp = { ...latestPKP, isActive: true };
        console.log('[PKP] Reactivating latest PKP:', pkp.ethAddress);
      } else {
        // Mint new PKP
        console.log('[PKP] Minting new PKP...');
        const mintResult = await this.mintNewPKP(authMethodId);
        
        pkp = {
          tokenId: mintResult.tokenId,
          publicKey: mintResult.publicKey,
          ethAddress: mintResult.ethAddress,
          createdAt: Date.now(),
          isActive: true,
        };
        console.log('[PKP] New PKP minted:', pkp.ethAddress);
      }

      // Store active PKP
      this.activePKPs.set(pkp.tokenId, pkp);

      return {
        pkp,
        litNodeClient: this.litNodeClient,
      };
    } catch (error) {
      console.error('[PKP] Failed to create PKP:', error);
      throw error;
    }
  }

  /**
   * Fetch existing PKPs for an auth method
   */
  private async fetchExistingPKPs(authMethodId: string): Promise<PKPWallet[]> {
    try {
      // For now, return empty array - in production this would query the contract
      // This is a simplified version that doesn't require complex auth setup
      return [];
    } catch (error) {
      console.error('[PKP] Failed to fetch existing PKPs:', error);
      return [];
    }
  }

  /**
   * Mint a new PKP with simplified auth
   */
  private async mintNewPKP(authMethodId: string): Promise<{ tokenId: string; publicKey: string; ethAddress: string }> {
    try {
      // Generate a random PKP for demonstration
      // In production, this would use proper Lit Protocol minting
      const wallet = ethers.Wallet.createRandom();
      
      return {
        tokenId: Date.now().toString(),
        publicKey: wallet.publicKey,
        ethAddress: wallet.address,
      };
    } catch (error) {
      console.error('[PKP] Failed to mint new PKP:', error);
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
        .filter(pkp => !pkp.isActive)
        .filter(pkp => Date.now() - pkp.createdAt > 24 * 60 * 60 * 1000); // Older than 24 hours

      for (const pkp of inactivePKPs) {
        // Remove from active PKPs
        this.activePKPs.delete(pkp.tokenId);
        console.log(`[PKP] Cleaned up PKP: ${pkp.tokenId}`);
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
      console.log(`[PKP] Deactivated PKP: ${tokenId}`);
    }
  }

  /**
   * Execute a Lit Action with the PKP (simplified)
   */
  async executeLitAction(
    pkp: PKPWallet,
    litActionCode: string,
    jsParams: Record<string, unknown>
  ): Promise<unknown> {
    try {
      console.log('[PKP] Executing Lit Action...');
      
      // Simplified execution - in production this would use session signatures
      const response = await this.litNodeClient.executeJs({
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
   * Get PKP wallet balance (simplified)
   */
  async getWalletBalance(pkp: PKPWallet): Promise<{
    sol: number;
    eth: number;
    tokens: Record<string, number>;
  }> {
    try {
      // Get ETH balance
      const ethBalance = await this.provider.getBalance(pkp.ethAddress);
      
      return {
        sol: 0, // Would be fetched from Solana
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
export const pkpWalletServiceV7 = new PKPWalletServiceV7();

// Helper function to initialize PKP service
export async function initializePKPServiceV7(): Promise<void> {
  try {
    await pkpWalletServiceV7.initialize();
    console.log('[PKP] Service initialized successfully');
  } catch (error) {
    console.error('[PKP] Service initialization failed:', error);
    throw error;
  }
}
