'use client';

import React, { useState } from 'react';
import {
  pkpWalletGoogleAuth,
  initializePKPGoogleAuth,
  PKPWallet,
} from '@/vincent/pkp-wallet-google-auth';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<PKPWallet | null>(null);

  const router = useRouter();

  // Open modal and reset state
  const handleOpenModal = () => {
    setModalOpen(true);
    setError(null);
  };

  // Close modal and reset error
  const handleCloseModal = () => {
    setModalOpen(false);
    setError(null);
  };

  // Google wallet connect logic
  const handleConnectWallet = async () => {
    setLoading(true);
    setError(null);
    try {
      await initializePKPGoogleAuth();
      const result = await pkpWalletGoogleAuth.authenticateWithGoogle();
      setWallet(result.pkp);
      setModalOpen(false);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Google wallet connection failed');
      }
    } finally {
      setLoading(false);
    }
  };

  // Disconnect wallet
  const handleDisconnect = () => {
    setWallet(null);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
        fontFamily: "'Orbitron', 'Press Start 2P', monospace",
        color: '#fff',
        padding: '40px 0',
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Press+Start+2P&display=swap');
        .glass {
          background: rgba(255,255,255,0.08);
          border-radius: 1.5rem;
          box-shadow: 0 8px 32px 0 rgba(31,38,135,0.37), 0 0 32px 8px #00eaff99;
          border: 2px solid transparent;
          border-image: linear-gradient(120deg, #00eaff, #00ff99, #ffe600, #ff00cc, #00eaff) 1;
          backdrop-filter: blur(8px);
          animation: glassGlow 3s linear infinite alternate;
        }
        @keyframes glassGlow {
          0% { box-shadow: 0 8px 32px 0 #00eaff99, 0 0 32px 8px #ffe60099; }
          100% { box-shadow: 0 8px 32px 0 #ff00cc99, 0 0 32px 8px #00ff9999; }
        }
        .neon {
          background: linear-gradient(90deg, #ffe600, #00eaff, #00ff99, #ff00cc, #ffe600);
          background-size: 400% 400%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          text-fill-color: transparent;
          animation: neonGradient 4s linear infinite alternate;
        }
        @keyframes neonGradient {
          0% { background-position: 0% 50%; }
          100% { background-position: 100% 50%; }
        }
        .degen-btn {
          background: linear-gradient(90deg, #ffe600, #00eaff, #00ff99, #ff00cc, #ffe600);
          background-size: 300% 300%;
          color: #000;
          font-family: 'Orbitron', monospace;
          border: none;
          border-radius: 1rem;
          padding: 1rem 2rem;
          font-size: 1.5rem;
          font-weight: bold;
          box-shadow: 0 0 32px 8px #ffe60099, 0 0 32px 8px #00eaff99;
          cursor: pointer;
          margin-bottom: 2rem;
          transition: background 0.3s, color 0.3s;
          animation: neonGradient 4s linear infinite alternate;
        }
        .degen-btn:hover {
          background: linear-gradient(270deg, #ff00cc, #00ff99, #00eaff, #ffe600, #ff00cc);
          color: #fff;
        }
        .party-table th, .party-table td {
          padding: 1rem 1.5rem;
          font-size: 1.2rem;
        }
        .party-table th {
          background: linear-gradient(90deg, #ffe600, #00eaff, #00ff99, #ff00cc, #ffe600);
          background-size: 400% 400%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          text-fill-color: transparent;
          font-family: 'Press Start 2P', monospace;
          animation: neonGradient 4s linear infinite alternate;
        }
        .party-table tr {
          transition: background 0.2s;
        }
        .party-table tr:hover {
          background: rgba(0,238,255,0.08);
        }
        .invest-btn {
          background: linear-gradient(90deg, #ffe600, #00eaff, #00ff99, #ff00cc, #ffe600);
          background-size: 300% 300%;
          color: #000;
          border: none;
          border-radius: 0.7rem;
          padding: 0.5rem 1.2rem;
          font-family: 'Orbitron', monospace;
          font-weight: bold;
          box-shadow: 0 0 16px 4px #00ff9999, 0 0 16px 4px #ffe60099;
          cursor: pointer;
          animation: neonGradient 4s linear infinite alternate;
        }
        .invest-btn:hover {
          background: linear-gradient(270deg, #ff00cc, #00ff99, #00eaff, #ffe600, #ff00cc);
          color: #fff;
        }
        .modal-bg {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.7);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .modal-content {
          background: rgba(30,30,40,0.98);
          border-radius: 2rem;
          box-shadow: 0 0 64px 8px #00eaff99, 0 0 32px 8px #ffe60099;
          padding: 2.5rem 2.5rem 2rem 2.5rem;
          min-width: 350px;
          max-width: 95vw;
          text-align: center;
          border: 2px solid #00eaff;
          position: relative;
        }
        .modal-close {
          position: absolute;
          top: 1.2rem;
          right: 1.5rem;
          font-size: 2rem;
          color: #00eaff;
          background: none;
          border: none;
          cursor: pointer;
        }
        .wallet-address {
          font-family: 'Orbitron', monospace;
          font-size: 1.1rem;
          color: #00ff99;
          background: rgba(0,0,0,0.3);
          border-radius: 0.5rem;
          padding: 0.5rem 1rem;
          margin-top: 0.5rem;
          word-break: break-all;
        }
        .disconnect-btn {
          margin-top: 1.2rem;
          background: #ff0066;
          color: #fff;
          border: none;
          border-radius: 0.7rem;
          padding: 0.5rem 1.2rem;
          font-family: 'Orbitron', monospace;
          font-weight: bold;
          box-shadow: 0 0 16px 4px #ff006699;
          cursor: pointer;
          font-size: 1.1rem;
        }
        .disconnect-btn:hover {
          background: #ffe600;
          color: #000;
        }
      `}</style>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1
          className="neon"
          style={{ fontSize: 56, fontFamily: "'Orbitron', monospace" }}
        >
          Degen Investory
        </h1>
        <p
          style={{
            color: '#00eaff',
            fontSize: 24,
            fontFamily: "'Press Start 2P', monospace",
          }}
        >
          The sexiest, darkest, most degen crypto party on Solana
        </p>
        {wallet ? (
          <div>
            <div className="wallet-address">Connected: {wallet.ethAddress}</div>
            <button className="disconnect-btn" onClick={handleDisconnect}>
              Disconnect
            </button>
          </div>
        ) : (
          <button className="degen-btn" onClick={handleOpenModal}>
            Connect PKP Wallet
          </button>
        )}
      </div>
      {modalOpen && (
        <div className="modal-bg">
          <div className="modal-content glass">
            <button className="modal-close" onClick={handleCloseModal}>
              &times;
            </button>
            <h2 className="neon" style={{ fontSize: 32, marginBottom: 16 }}>
              Connect with Google
            </h2>
            <p style={{ color: '#00eaff', marginBottom: 24 }}>
              Secure your degen trading with a Google PKP wallet
            </p>
            {error && (
              <div style={{ color: '#ff0066', marginBottom: 16 }}>{error}</div>
            )}
            {loading ? (
              <div style={{ fontSize: 20, color: '#ffe600', margin: '32px 0' }}>
                Connecting to Google Wallet...
              </div>
            ) : (
              <button
                className="degen-btn"
                style={{ width: '100%' }}
                onClick={handleConnectWallet}
              >
                Connect Google Wallet
              </button>
            )}
          </div>
        </div>
      )}
      <div
        className="glass"
        style={{ maxWidth: 900, margin: '0 auto', padding: 32 }}
      >
        <table
          className="party-table"
          style={{
            width: '100%',
            borderCollapse: 'separate',
            borderSpacing: 0,
          }}
        >
          <thead>
            <tr>
              <th>Name</th>
              <th>Price</th>
              <th>24h Change</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Solana</td>
              <td>$175.23</td>
              <td style={{ color: '#00ff99' }}>2.1%</td>
              <td>
                {wallet && (
                  <button
                    className="invest-btn"
                    onClick={() => router.push('/investor')}
                  >
                    Invest
                  </button>
                )}
              </td>
            </tr>
            <tr>
              <td>Bonk</td>
              <td>$0.000032</td>
              <td style={{ color: '#00ff99' }}>12.5%</td>
              <td>
                {wallet && (
                  <button
                    className="invest-btn"
                    onClick={() => router.push('/investor')}
                  >
                    Invest
                  </button>
                )}
              </td>
            </tr>
            <tr>
              <td>Pepe</td>
              <td>$0.0000012</td>
              <td style={{ color: '#ff0066' }}>-8.2%</td>
              <td>
                {wallet && (
                  <button
                    className="invest-btn"
                    onClick={() => router.push('/investor')}
                  >
                    Invest
                  </button>
                )}
              </td>
            </tr>
            <tr>
              <td>Shiba Inu</td>
              <td>$0.000015</td>
              <td style={{ color: '#00ff99' }}>3.7%</td>
              <td>
                {wallet && (
                  <button
                    className="invest-btn"
                    onClick={() => router.push('/investor')}
                  >
                    Invest
                  </button>
                )}
              </td>
            </tr>
            <tr>
              <td>FLOKI</td>
              <td>$0.00014</td>
              <td style={{ color: '#00ff99' }}>7.9%</td>
              <td>
                {wallet && (
                  <button
                    className="invest-btn"
                    onClick={() => router.push('/investor')}
                  >
                    Invest
                  </button>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
