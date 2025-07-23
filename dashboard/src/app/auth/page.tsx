'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
// Google OAuth (not currently used but available for future implementation)
import { 
  pkpWalletGoogleAuth,
  initializePKPGoogleAuth,
  AttestationResult as GoogleAttestationResult
} from '../../vincent/pkp-wallet-google-auth';
import { 
  pkpWalletServiceV7,
  initializePKPServiceV7,
  AttestationResult as SimpleAttestationResult
} from '../../vincent/pkp-wallet-v7';

type AttestationResult = GoogleAttestationResult | SimpleAttestationResult;
import { 
  vincentToolDeploymentService, 
  VincentToolDeployment 
} from '../../vincent/vincent-tool-deployment';
import { MemesolSpendingLimitSettings } from '../../vincent/memesol-spending-policy';

export default function AuthPage() {
  const router = useRouter();
  const [isInitializing, setIsInitializing] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [attestation, setAttestation] = useState<AttestationResult | null>(null);
  const [deployment, setDeployment] = useState<VincentToolDeployment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [step, setStep] = useState<'auth' | 'deploy' | 'complete'>('auth');

  useEffect(() => {
    initializeService();
  }, []);

  const initializeService = async () => {
    try {
      setIsInitializing(true);
      await initializePKPGoogleAuth();
      console.log('[Auth] PKP Google auth service initialized');
    } catch (error) {
      console.error('[Auth] Failed to initialize PKP service:', error);
      setError('Failed to initialize PKP service. Please refresh and try again.');
    } finally {
      setIsInitializing(false);
    }
  };

  const authenticateWithGoogle = async () => {
    setLoading(true);
    setError('');
    
    try {
      console.log('[Auth] Starting Google authentication...');
      const result = await pkpWalletGoogleAuth.authenticateWithGoogle();
      
      setAttestation(result as AttestationResult);
      setIsAuthenticated(true);
      setStep('deploy');
      
      console.log('[Auth] Google authentication successful:', result.pkp.ethAddress);
    } catch (error) {
      console.error('[Auth] Google authentication failed:', error);
      setError(error instanceof Error ? error.message : 'Google authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const authenticateWithPasskey = async () => {
    setLoading(true);
    setError('');
    
    try {
      console.log('[Auth] Starting Passkey authentication...');
      const result = await pkpWalletServiceV7.createSimplePKP('webauthn-user');
      
      setAttestation(result);
      setIsAuthenticated(true);
      setStep('deploy');
      
      console.log('[Auth] Passkey authentication successful:', result.pkp.ethAddress);
    } catch (error) {
      console.error('[Auth] Passkey authentication failed:', error);
      setError(error instanceof Error ? error.message : 'Passkey authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const deployTradingTool = async () => {
    if (!attestation) return;
    
    setLoading(true);
    setError('');
    
    try {
      console.log('[Auth] Deploying MemeSol trading tool...');
      
      // Default spending limits for new users
      const defaultSpendingLimits: MemesolSpendingLimitSettings = {
        dailyLimit: 1.0,
        weeklyLimit: 5.0,
        monthlyLimit: 20.0,
        maxRiskExposure: 0.3,
        maxPositionSize: 0.5,
        minAgentScore: 40,
        allowedRiskCategories: ['low', 'moderate'],
        emergencyStop: false,
        whitelist: [],
        blacklist: [],
      };

      const toolDeployment = await vincentToolDeploymentService.deployMemesolTradingTool(
        attestation,
        defaultSpendingLimits
      );

      setDeployment(toolDeployment);
      setStep('complete');
      
      console.log('[Auth] Tool deployment successful:', toolDeployment.toolId);
    } catch (error) {
      console.error('[Auth] Tool deployment failed:', error);
      setError(error instanceof Error ? error.message : 'Tool deployment failed');
    } finally {
      setLoading(false);
    }
  };

  const proceedToInvestor = () => {
    // Store attestation and deployment info in localStorage for the investor page
    if (attestation && deployment) {
      localStorage.setItem('vincent_attestation', JSON.stringify({
        pkp: attestation.pkp,
        deployment: deployment,
      }));
    }
    
    router.push('/investor');
  };

  if (isInitializing) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '100vh',
        flexDirection: 'column',
        gap: 20
      }}>
        <div style={{ 
          width: 50, 
          height: 50, 
          border: '4px solid #f3f3f3',
          borderTop: '4px solid #007bff',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <div style={{ fontSize: 18, color: '#666' }}>
          Initializing PKP Wallet Service...
        </div>
        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ 
      maxWidth: 600, 
      margin: '0 auto', 
      padding: 40,
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center'
    }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 style={{ fontSize: 32, fontWeight: '600', color: '#2c3e50', marginBottom: 16 }}>
          🔐 PKP Wallet Authentication
        </h1>
        <p style={{ fontSize: 18, color: '#7f8c8d', marginBottom: 8 }}>
          Secure your MemeSol trading with Vincent PKP wallets
        </p>
        <p style={{ fontSize: 14, color: '#95a5a6' }}>
          Step {step === 'auth' ? '1' : step === 'deploy' ? '2' : '3'} of 3
        </p>
      </div>

      {error && (
        <div style={{
          padding: 16,
          background: '#fff5f5',
          border: '1px solid #fed7d7',
          borderRadius: 8,
          color: '#c53030',
          marginBottom: 24,
          textAlign: 'center'
        }}>
          {error}
        </div>
      )}

      {step === 'auth' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{
            padding: 24,
            background: '#f8f9fa',
            borderRadius: 12,
            border: '1px solid #e9ecef',
            marginBottom: 20
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 20, color: '#495057' }}>
              Choose Authentication Method
            </h3>
            <p style={{ margin: 0, fontSize: 14, color: '#6c757d' }}>
              PKP wallets provide non-custodial, programmable key management. 
              Choose your preferred authentication method to create or access your PKP.
            </p>
          </div>

          <button
            onClick={authenticateWithGoogle}
            disabled={loading}
            style={{
              padding: '20px 24px',
              background: loading ? '#6c757d' : 'linear-gradient(135deg, #db4437, #c23321)',
              color: 'white',
              border: 'none',
              borderRadius: 12,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 16,
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              transition: 'all 0.2s',
              opacity: loading ? 0.7 : 1,
            }}
          >
            <span style={{ fontSize: 20 }}>🔍</span>
            {loading ? 'Authenticating...' : 'Continue with Google'}
          </button>

          <button
            onClick={authenticateWithPasskey}
            disabled={loading}
            style={{
              padding: '20px 24px',
              background: loading ? '#6c757d' : 'linear-gradient(135deg, #007bff, #0056b3)',
              color: 'white',
              border: 'none',
              borderRadius: 12,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 16,
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              transition: 'all 0.2s',
              opacity: loading ? 0.7 : 1,
            }}
          >
            <span style={{ fontSize: 20 }}>🔑</span>
            {loading ? 'Authenticating...' : 'Continue with Passkey'}
          </button>

          <div style={{
            padding: 16,
            background: '#e7f3ff',
            border: '1px solid #b8daff',
            borderRadius: 8,
            fontSize: 14,
            color: '#004085'
          }}>
            <strong>💡 Pro Tip:</strong> Passkeys provide the highest security and don't require 
            third-party accounts. Google authentication is convenient if you prefer using your existing account.
          </div>
        </div>
      )}

      {step === 'deploy' && attestation && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{
            padding: 24,
            background: '#f0f8f0',
            borderRadius: 12,
            border: '1px solid #c8e6c9',
            marginBottom: 20
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 20, color: '#2e7d32' }}>
              ✅ PKP Wallet Created Successfully
            </h3>
            <p style={{ margin: '0 0 12px 0', fontSize: 14, color: '#388e3c' }}>
              <strong>Address:</strong> {attestation.pkp.ethAddress}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: '#4caf50' }}>
              Your PKP wallet is secure and ready for trading. Next, we'll deploy your trading tool.
            </p>
          </div>

          <div style={{
            padding: 24,
            background: '#f8f9fa',
            borderRadius: 12,
            border: '1px solid #e9ecef',
            marginBottom: 20
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 20, color: '#495057' }}>
              Deploy MemeSol Trading Tool
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: 14, color: '#6c757d' }}>
              We'll deploy the MemeSol trading tool as a Lit Action with default spending limits. 
              You can customize these limits later in the investor dashboard.
            </p>
            
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: '1fr 1fr', 
              gap: 12,
              fontSize: 13,
              color: '#6c757d'
            }}>
              <div>📊 Daily Limit: 1.0 SOL</div>
              <div>📈 Weekly Limit: 5.0 SOL</div>
              <div>📉 Min Agent Score: 40</div>
              <div>⚡ Risk Categories: Low, Moderate</div>
            </div>
          </div>

          <button
            onClick={deployTradingTool}
            disabled={loading}
            style={{
              padding: '20px 24px',
              background: loading ? '#6c757d' : 'linear-gradient(135deg, #28a745, #1e7e34)',
              color: 'white',
              border: 'none',
              borderRadius: 12,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 16,
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              transition: 'all 0.2s',
              opacity: loading ? 0.7 : 1,
            }}
          >
            <span style={{ fontSize: 20 }}>🚀</span>
            {loading ? 'Deploying Tool...' : 'Deploy Trading Tool'}
          </button>
        </div>
      )}

      {step === 'complete' && deployment && attestation && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{
            padding: 24,
            background: '#f0f8f0',
            borderRadius: 12,
            border: '1px solid #c8e6c9',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 24, color: '#2e7d32' }}>
              Setup Complete!
            </h3>
            <p style={{ margin: 0, fontSize: 16, color: '#388e3c' }}>
              Your Vincent PKP wallet and MemeSol trading tool are ready
            </p>
          </div>

          <div style={{
            padding: 24,
            background: '#f8f9fa',
            borderRadius: 12,
            border: '1px solid #e9ecef'
          }}>
            <h4 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#495057' }}>
              📋 Deployment Summary
            </h4>
            <div style={{ display: 'grid', gap: 8, fontSize: 14, color: '#6c757d' }}>
              <div><strong>PKP Address:</strong> {attestation.pkp.ethAddress}</div>
              <div><strong>Tool ID:</strong> {deployment.toolId}</div>
              <div><strong>Status:</strong> <span style={{ color: '#28a745' }}>Active</span></div>
              <div><strong>Deployed:</strong> {new Date(deployment.deployedAt).toLocaleString()}</div>
            </div>
          </div>

          <button
            onClick={proceedToInvestor}
            style={{
              padding: '20px 24px',
              background: 'linear-gradient(135deg, #007bff, #0056b3)',
              color: 'white',
              border: 'none',
              borderRadius: 12,
              cursor: 'pointer',
              fontSize: 16,
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              transition: 'all 0.2s',
            }}
          >
            <span style={{ fontSize: 20 }}>💼</span>
            Go to Investor Dashboard
          </button>
        </div>
      )}
    </div>
  );
}
