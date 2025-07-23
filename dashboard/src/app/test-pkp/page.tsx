'use client'

import { useState } from 'react'
import { 
  pkpWalletGoogleAuth, 
  PKPWallet as GooglePKPWallet, 
  AttestationResult as GoogleAttestationResult, 
  initializePKPGoogleAuth 
} from '@/vincent/pkp-wallet-google-auth'
import { 
  pkpWalletServiceV7, 
  PKPWallet as SimplePKPWallet,
  AttestationResult as SimpleAttestationResult,
  initializePKPServiceV7 
} from '@/vincent/pkp-wallet-v7'

// Union types for handling both implementations
type PKPWallet = GooglePKPWallet | SimplePKPWallet
type AttestationResult = GoogleAttestationResult | SimpleAttestationResult

export default function TestPKPPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AttestationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activePKPs, setActivePKPs] = useState<PKPWallet[]>([])

  const handleGoogleAuth = async () => {
    setLoading(true)
    setError(null)
    
    try {
      // Initialize PKP Google Auth service
      await initializePKPGoogleAuth()
      
      // Authenticate with Google and create PKP
      const attestationResult = await pkpWalletGoogleAuth.authenticateWithGoogle()
      
      setResult(attestationResult as AttestationResult)
      setActivePKPs(pkpWalletGoogleAuth.getActivePKPs() as PKPWallet[])
      
      console.log('Google PKP Authentication successful:', attestationResult.pkp)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google authentication failed')
      console.error('Google PKP Authentication failed:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleWebAuthnAuth = async () => {
    setLoading(true)
    setError(null)
    
    try {
      // Initialize PKP service
      await initializePKPServiceV7()
      
      // Create simple PKP (simplified for demo)
      const attestationResult = await pkpWalletServiceV7.createSimplePKP('webauthn-user')
      
      setResult(attestationResult as AttestationResult)
      setActivePKPs(pkpWalletServiceV7.getActivePKPs() as PKPWallet[])
      
      console.log('PKP Creation successful:', attestationResult.pkp)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'PKP creation failed')
      console.error('PKP Creation failed:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDeactivatePKP = async (tokenId: string) => {
    try {
      await pkpWalletServiceV7.deactivatePKP(tokenId)
      setActivePKPs(pkpWalletServiceV7.getActivePKPs() as PKPWallet[])
      console.log(`PKP ${tokenId} deactivated`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate PKP')
    }
  }

  const handleTestLitAction = async () => {
    if (!result) {
      setError('No PKP available for testing')
      return
    }

    setLoading(true)
    try {
      const testCode = `
        (async () => {
          console.log('Testing Lit Action with PKP:', pkpEthAddress);
          return {
            success: true,
            message: 'PKP is working correctly!',
            pkpAddress: pkpEthAddress,
            timestamp: Date.now()
          };
        })();
      `

      let response;
      if ('sessionSigs' in result) {
        // Google auth PKP with session signatures
        response = await pkpWalletGoogleAuth.executeLitAction(
          result.pkp as GooglePKPWallet,
          result.sessionSigs,
          testCode,
          {}
        )
      } else {
        // Simple PKP without session signatures
        response = await pkpWalletServiceV7.executeLitAction(
          result.pkp as SimplePKPWallet,
          testCode,
          {}
        )
      }

      console.log('Lit Action test result:', response)
      alert('Lit Action test successful! Check console for details.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lit Action test failed')
      console.error('Lit Action test failed:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">PKP Wallet Test</h1>
          <p className="mt-2 text-gray-600">Test PKP creation, authentication, and cleanup</p>
        </div>

        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Authentication</h2>
          
          <div className="space-y-4">
            <button
              onClick={handleGoogleAuth}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Authenticate with Google'}
            </button>

            <button
              onClick={handleWebAuthnAuth}
              disabled={loading}
              className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Authenticate with WebAuthn (Passkey)'}
            </button>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}
        </div>

        {result && (
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">PKP Details</h2>
            
            <div className="space-y-2">
              <p><strong>Token ID:</strong> {result.pkp.tokenId}</p>
              <p><strong>ETH Address:</strong> {result.pkp.ethAddress}</p>
              <p><strong>Public Key:</strong> {result.pkp.publicKey.slice(0, 50)}...</p>
              <p><strong>Auth Method:</strong> {'authMethod' in result.pkp ? 
                `${result.pkp.authMethod.authMethodType === 2 ? 'Google OAuth' : 'WebAuthn'}` : 
                'Simplified PKP'}</p>
              <p><strong>Status:</strong> {result.pkp.isActive ? 'Active' : 'Inactive'}</p>
              <p><strong>Created:</strong> {new Date(result.pkp.createdAt).toLocaleString()}</p>
            </div>

            <button
              onClick={handleTestLitAction}
              disabled={loading}
              className="mt-4 bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 disabled:opacity-50"
            >
              Test Lit Action
            </button>
          </div>
        )}

        {activePKPs.length > 0 && (
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Active PKPs ({activePKPs.length})</h2>
            
            <div className="space-y-4">
              {activePKPs.map((pkp) => (
                <div key={pkp.tokenId} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p><strong>Token ID:</strong> {pkp.tokenId}</p>
                      <p><strong>Address:</strong> {pkp.ethAddress}</p>
                      <p><strong>Status:</strong> <span className="text-green-600">Active</span></p>
                      <p><strong>Created:</strong> {new Date(pkp.createdAt).toLocaleString()}</p>
                    </div>
                    <button
                      onClick={() => handleDeactivatePKP(pkp.tokenId)}
                      className="bg-red-600 text-white py-1 px-3 rounded text-sm hover:bg-red-700"
                    >
                      Deactivate
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 text-center text-sm text-gray-500">
          <p>PKPs older than 24 hours are automatically cleaned up.</p>
          <p>Only one PKP is kept active per authentication method.</p>
        </div>
      </div>
    </div>
  )
}
