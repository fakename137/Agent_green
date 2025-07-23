'use client';
import React, { useState, useEffect, useRef } from 'react';
import { MemesolSpendingLimitSettings } from '../../vincent/memesol-spending-policy';

interface AgentPerformance {
  totalTrades: number;
  winRate: number;
  avgROI: number;
  totalProfit: number;
  sharpeRatio: number;
  maxDrawdown: number;
  last30DaysROI: number;
}

interface InvestmentSession {
  id: string;
  startTime: string;
  endTime?: string;
  status: 'active' | 'paused' | 'completed';
  investedAmount: number;
  currentValue: number;
  roi: number;
  activePositions: number;
  settings: MemesolSpendingLimitSettings;
}

type RiskCategory = 'low' | 'moderate' | 'high';
const riskOptions: {
  value: RiskCategory;
  label: string;
  color: string;
  bg: string;
}[] = [
  { value: 'low', label: 'Low Risk', color: '#28a745', bg: '#d4edda' },
  {
    value: 'moderate',
    label: 'Moderate Risk',
    color: '#ffc107',
    bg: '#fff3cd',
  },
  { value: 'high', label: 'High Risk', color: '#dc3545', bg: '#f8d7da' },
];

export default function InvestorPage() {
  const [agentPerformance, setAgentPerformance] =
    useState<AgentPerformance | null>(null);
  const [investmentSessions, setInvestmentSessions] = useState<
    InvestmentSession[]
  >([]);
  const [newSessionSettings, setNewSessionSettings] = useState<
    MemesolSpendingLimitSettings & { allowedRiskCategories: RiskCategory[] }
  >({
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
  });
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [loading, setLoading] = useState(false);
  const confettiRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAgentPerformance();
    fetchInvestmentSessions();
  }, []);

  const fetchAgentPerformance = async () => {
    try {
      // Mock data - replace with actual API call
      const mockPerformance: AgentPerformance = {
        totalTrades: 156,
        winRate: 0.67,
        avgROI: 1.43,
        totalProfit: 12.5,
        sharpeRatio: 2.1,
        maxDrawdown: 0.18,
        last30DaysROI: 0.23,
      };
      setAgentPerformance(mockPerformance);
    } catch (error) {
      console.error('Failed to fetch agent performance:', error);
    }
  };

  const fetchInvestmentSessions = async () => {
    try {
      // Mock data - replace with actual API call
      const mockSessions: InvestmentSession[] = [
        {
          id: '1',
          startTime: new Date(
            Date.now() - 7 * 24 * 60 * 60 * 1000
          ).toISOString(),
          status: 'active',
          investedAmount: 15.0,
          currentValue: 18.2,
          roi: 0.213,
          activePositions: 3,
          settings: {
            dailyLimit: 2.0,
            weeklyLimit: 10.0,
            monthlyLimit: 40.0,
            maxRiskExposure: 0.25,
            maxPositionSize: 1.0,
            minAgentScore: 35,
            allowedRiskCategories: ['low', 'moderate', 'high'],
            emergencyStop: false,
          },
        },
      ];
      setInvestmentSessions(mockSessions);
    } catch (error) {
      console.error('Failed to fetch investment sessions:', error);
    }
  };

  // Confetti burst on new session
  const triggerConfetti = () => {
    if (confettiRef.current) {
      confettiRef.current.innerHTML = '';
      for (let i = 0; i < 40; i++) {
        const emoji = [
          '💸',
          '🪩',
          '🎉',
          '🤑',
          '🚀',
          '💎',
          '🌈',
          '🔥',
          '✨',
          '🥳',
        ][Math.floor(Math.random() * 10)];
        const span = document.createElement('span');
        span.textContent = emoji;
        span.style.position = 'absolute';
        span.style.left = Math.random() * 100 + '%';
        span.style.top = '50%';
        span.style.fontSize = 24 + Math.random() * 32 + 'px';
        span.style.transform = `translateY(0) rotate(${Math.random() * 360}deg)`;
        span.style.transition =
          'transform 1.2s cubic-bezier(.61,-0.01,.45,1.36), opacity 1.2s';
        setTimeout(() => {
          span.style.transform = `translateY(-${200 + Math.random() * 200}px) rotate(${Math.random() * 720 - 360}deg)`;
          span.style.opacity = '0';
        }, 10);
        confettiRef.current.appendChild(span);
      }
      setTimeout(() => {
        if (confettiRef.current) confettiRef.current.innerHTML = '';
      }, 1400);
    }
  };

  const createInvestmentSession = async () => {
    setLoading(true);
    try {
      // Here you would integrate with Vincent to create a new investment session
      const newSession: InvestmentSession = {
        id: Date.now().toString(),
        startTime: new Date().toISOString(),
        status: 'active',
        investedAmount: 0,
        currentValue: 0,
        roi: 0,
        activePositions: 0,
        settings: { ...newSessionSettings },
      };

      setInvestmentSessions([...investmentSessions, newSession]);
      setShowCreateSession(false);
      triggerConfetti();

      // Reset form
      setNewSessionSettings({
        dailyLimit: 1.0,
        weeklyLimit: 5.0,
        monthlyLimit: 20.0,
        maxRiskExposure: 0.3,
        maxPositionSize: 0.5,
        minAgentScore: 40,
        allowedRiskCategories: ['low', 'moderate'],
        emergencyStop: false,
      });
    } catch (error) {
      console.error('Failed to create investment session:', error);
    }
    setLoading(false);
  };

  const toggleEmergencyStop = async (sessionId: string) => {
    setInvestmentSessions((sessions) =>
      sessions.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              settings: {
                ...session.settings,
                emergencyStop: !session.settings.emergencyStop,
              },
            }
          : session
      )
    );
  };

  const pauseSession = async (sessionId: string) => {
    setInvestmentSessions((sessions) =>
      sessions.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              status: session.status === 'active' ? 'paused' : 'active',
            }
          : session
      )
    );
  };

  if (!agentPerformance) {
    return <div style={{ padding: 32 }}>Loading agent performance...</div>;
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
        fontFamily: "'Orbitron', 'Press Start 2P', monospace",
        color: '#fff',
        padding: 0,
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
        .degen-btn, .invest-btn, .modal-btn {
          background: linear-gradient(90deg, #ffe600, #00eaff, #00ff99, #ff00cc, #ffe600);
          background-size: 300% 300%;
          color: #000;
          font-family: 'Orbitron', monospace;
          border: none;
          border-radius: 1rem;
          padding: 1rem 2rem;
          font-size: 1.2rem;
          font-weight: bold;
          box-shadow: 0 0 32px 8px #ffe60099, 0 0 32px 8px #00eaff99;
          cursor: pointer;
          margin-bottom: 1rem;
          transition: background 0.3s, color 0.3s;
          animation: neonGradient 4s linear infinite alternate;
        }
        .degen-btn:hover, .invest-btn:hover, .modal-btn:hover {
          background: linear-gradient(270deg, #ff00cc, #00ff99, #00eaff, #ffe600, #ff00cc);
          color: #fff;
        }
        .party-card {
          border-radius: 1.5rem;
          background: rgba(255,255,255,0.10);
          border: 2px solid #00eaff;
          box-shadow: 0 0 32px 8px #00eaff99, 0 0 32px 8px #ffe60099;
          padding: 2rem;
          margin-bottom: 2rem;
          animation: glassGlow 3s linear infinite alternate;
        }
        .party-header {
          font-family: 'Press Start 2P', monospace;
          font-size: 2.5rem;
          margin-bottom: 0.5rem;
          letter-spacing: 2px;
          text-shadow: 0 0 8px #00eaff, 0 0 16px #ff00cc;
        }
        .party-sub {
          color: #00eaff;
          font-size: 1.2rem;
          font-family: 'Orbitron', monospace;
          margin-bottom: 2rem;
        }
        .session-status {
          font-size: 1rem;
          font-family: 'Orbitron', monospace;
          border-radius: 0.5rem;
          padding: 0.2rem 0.8rem;
          margin-left: 1rem;
          background: linear-gradient(90deg, #00ff99, #ffe600);
          color: #000;
          box-shadow: 0 0 8px #00ff99;
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
      `}</style>
      <div
        ref={confettiRef}
        style={{
          position: 'fixed',
          pointerEvents: 'none',
          left: 0,
          top: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 2000,
        }}
      />
      <header style={{ marginBottom: 40, textAlign: 'center' }}>
        <h1 className="party-header neon">🤖 MemeSol AI Trading Agent</h1>
        <p className="party-sub">
          Invest in our autonomous memecoin trading agent with customizable risk
          policies
        </p>
      </header>
      <section className="party-card">
        <h2 className="neon" style={{ fontSize: 32 }}>
          📊 Agent Performance
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 20,
            marginTop: 20,
          }}
        >
          <div
            style={{
              textAlign: 'center',
              padding: 16,
              background: '#f8f9fa',
              borderRadius: 8,
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#28a745' }}>
              {(agentPerformance.winRate * 100).toFixed(1)}%
            </div>
            <div style={{ fontSize: 14, color: '#666' }}>Win Rate</div>
          </div>
          <div
            style={{
              textAlign: 'center',
              padding: 16,
              background: '#f8f9fa',
              borderRadius: 8,
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#007bff' }}>
              {agentPerformance.avgROI.toFixed(2)}x
            </div>
            <div style={{ fontSize: 14, color: '#666' }}>Avg ROI</div>
          </div>
          <div
            style={{
              textAlign: 'center',
              padding: 16,
              background: '#f8f9fa',
              borderRadius: 8,
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#17a2b8' }}>
              {agentPerformance.totalProfit.toFixed(1)} SOL
            </div>
            <div style={{ fontSize: 14, color: '#666' }}>Total Profit</div>
          </div>
          <div
            style={{
              textAlign: 'center',
              padding: 16,
              background: '#f8f9fa',
              borderRadius: 8,
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#6f42c1' }}>
              {agentPerformance.sharpeRatio.toFixed(1)}
            </div>
            <div style={{ fontSize: 14, color: '#666' }}>Sharpe Ratio</div>
          </div>
          <div
            style={{
              textAlign: 'center',
              padding: 16,
              background: '#f8f9fa',
              borderRadius: 8,
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#dc3545' }}>
              {(agentPerformance.maxDrawdown * 100).toFixed(1)}%
            </div>
            <div style={{ fontSize: 14, color: '#666' }}>Max Drawdown</div>
          </div>
          <div
            style={{
              textAlign: 'center',
              padding: 16,
              background: '#f8f9fa',
              borderRadius: 8,
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#fd7e14' }}>
              {(agentPerformance.last30DaysROI * 100).toFixed(1)}%
            </div>
            <div style={{ fontSize: 14, color: '#666' }}>30D ROI</div>
          </div>
        </div>
      </section>
      <section className="party-card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <h2 className="neon" style={{ fontSize: 28 }}>
            💼 Your Investment Sessions
          </h2>
          <button
            className="degen-btn"
            onClick={() => setShowCreateSession(true)}
          >
            + New Investment Session
          </button>
        </div>
        {investmentSessions.map((session) => (
          <div
            key={session.id}
            style={{
              padding: 24,
              border: '1px solid #eee',
              borderRadius: 12,
              marginBottom: 16,
              background: session.status === 'active' ? '#f8fff8' : '#f8f9fa',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <div>
                <h3 style={{ margin: 0 }}>
                  Session #{session.id}
                  <span
                    style={{
                      marginLeft: 12,
                      padding: '4px 8px',
                      background:
                        session.status === 'active' ? '#28a745' : '#6c757d',
                      color: 'white',
                      borderRadius: 4,
                      fontSize: 12,
                    }}
                  >
                    {session.status.toUpperCase()}
                  </span>
                </h3>
                <p style={{ margin: '4px 0', color: '#666' }}>
                  Started: {new Date(session.startTime).toLocaleDateString()}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 'bold',
                    color: session.roi >= 0 ? '#28a745' : '#dc3545',
                  }}
                >
                  {session.currentValue.toFixed(2)} SOL (
                  {(session.roi * 100).toFixed(1)}%)
                </div>
                <div style={{ fontSize: 14, color: '#666' }}>
                  Invested: {session.investedAmount.toFixed(2)} SOL
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 16,
                marginBottom: 16,
              }}
            >
              <div>
                <strong>Active Positions:</strong> {session.activePositions}
              </div>
              <div>
                <strong>Daily Limit:</strong> {session.settings.dailyLimit} SOL
              </div>
              <div>
                <strong>Max Position:</strong>{' '}
                {session.settings.maxPositionSize} SOL
              </div>
              <div>
                <strong>Min Score:</strong> {session.settings.minAgentScore}
              </div>
              <div>
                <strong>Risk Categories:</strong>{' '}
                {session.settings.allowedRiskCategories.join(', ')}
              </div>
              <div>
                <strong>Emergency Stop:</strong>
                <span
                  style={{
                    color: session.settings.emergencyStop
                      ? '#dc3545'
                      : '#28a745',
                    marginLeft: 8,
                  }}
                >
                  {session.settings.emergencyStop ? 'ACTIVE' : 'OFF'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => pauseSession(session.id)}
                style={{
                  padding: '8px 16px',
                  background:
                    session.status === 'active' ? '#ffc107' : '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                {session.status === 'active' ? 'Pause' : 'Resume'}
              </button>
              <button
                onClick={() => toggleEmergencyStop(session.id)}
                style={{
                  padding: '8px 16px',
                  background: session.settings.emergencyStop
                    ? '#28a745'
                    : '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                {session.settings.emergencyStop
                  ? 'Disable Emergency Stop'
                  : 'Emergency Stop'}
              </button>
            </div>
          </div>
        ))}
      </section>
      {showCreateSession && (
        <div className="modal-bg">
          <div className="modal-content glass">
            <button
              className="modal-close"
              onClick={() => setShowCreateSession(false)}
            >
              &times;
            </button>
            <h2 className="neon" style={{ fontSize: 32, marginBottom: 16 }}>
              🛠️ Configure Investment Session
            </h2>
            <p className="party-sub">
              Set your trading limits and risk preferences
            </p>
            <div style={{ display: 'grid', gap: 24 }}>
              {/* Spending Limits Section */}
              <div
                style={{
                  padding: 20,
                  background: '#f8f9fa',
                  borderRadius: 12,
                  border: '1px solid #e9ecef',
                }}
              >
                <h4
                  style={{
                    margin: '0 0 16px 0',
                    fontSize: 18,
                    color: '#495057',
                    fontWeight: '600',
                  }}
                >
                  💰 Spending Limits
                </h4>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 20,
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: 8,
                        fontWeight: '600',
                        fontSize: 14,
                        color: '#fff', // changed from #495057 to white
                      }}
                    >
                      Daily Limit (SOL)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="e.g., 1.0"
                      value={newSessionSettings.dailyLimit}
                      onChange={(e) =>
                        setNewSessionSettings({
                          ...newSessionSettings,
                          dailyLimit: parseFloat(e.target.value) || 0,
                        })
                      }
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        background: '#23263a', // dark background
                        color: '#fff', // white text
                        border: '2px solid #444', // higher-contrast border
                        borderRadius: 8,
                        fontSize: 16,
                        outline: 'none',
                        transition: 'border-color 0.2s',
                      }}
                      onFocus={(e) => (e.target.style.borderColor = '#00eaff')}
                      onBlur={(e) => (e.target.style.borderColor = '#444')}
                    />
                    <small style={{ color: '#6c757d', fontSize: 12 }}>
                      Maximum SOL to spend per day
                    </small>
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: 8,
                        fontWeight: '600',
                        fontSize: 14,
                        color: '#fff', // changed from #495057 to white
                      }}
                    >
                      Weekly Limit (SOL)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="e.g., 5.0"
                      value={newSessionSettings.weeklyLimit}
                      onChange={(e) =>
                        setNewSessionSettings({
                          ...newSessionSettings,
                          weeklyLimit: parseFloat(e.target.value) || 0,
                        })
                      }
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        background: '#23263a', // dark background
                        color: '#fff', // white text
                        border: '2px solid #444', // higher-contrast border
                        borderRadius: 8,
                        fontSize: 16,
                        outline: 'none',
                        transition: 'border-color 0.2s',
                      }}
                      onFocus={(e) => (e.target.style.borderColor = '#00eaff')}
                      onBlur={(e) => (e.target.style.borderColor = '#444')}
                    />
                    <small style={{ color: '#6c757d', fontSize: 12 }}>
                      Maximum SOL to spend per week
                    </small>
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: 8,
                        fontWeight: '600',
                        fontSize: 14,
                        color: '#fff', // changed from #495057 to white
                      }}
                    >
                      Monthly Limit (SOL)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="e.g., 20.0"
                      value={newSessionSettings.monthlyLimit}
                      onChange={(e) =>
                        setNewSessionSettings({
                          ...newSessionSettings,
                          monthlyLimit: parseFloat(e.target.value) || 0,
                        })
                      }
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        background: '#23263a', // dark background
                        color: '#fff', // white text
                        border: '2px solid #444', // higher-contrast border
                        borderRadius: 8,
                        fontSize: 16,
                        outline: 'none',
                        transition: 'border-color 0.2s',
                      }}
                      onFocus={(e) => (e.target.style.borderColor = '#00eaff')}
                      onBlur={(e) => (e.target.style.borderColor = '#444')}
                    />
                    <small style={{ color: '#6c757d', fontSize: 12 }}>
                      Maximum SOL to spend per month
                    </small>
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: 8,
                        fontWeight: '600',
                        fontSize: 14,
                        color: '#fff', // changed from #495057 to white
                      }}
                    >
                      Max Position Size (SOL)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g., 0.5"
                      value={newSessionSettings.maxPositionSize}
                      onChange={(e) =>
                        setNewSessionSettings({
                          ...newSessionSettings,
                          maxPositionSize: parseFloat(e.target.value) || 0,
                        })
                      }
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        background: '#23263a', // dark background
                        color: '#fff', // white text
                        border: '2px solid #444', // higher-contrast border
                        borderRadius: 8,
                        fontSize: 16,
                        outline: 'none',
                        transition: 'border-color 0.2s',
                      }}
                      onFocus={(e) => (e.target.style.borderColor = '#00eaff')}
                      onBlur={(e) => (e.target.style.borderColor = '#444')}
                    />
                    <small style={{ color: '#6c757d', fontSize: 12 }}>
                      Maximum SOL per single trade
                    </small>
                  </div>
                </div>
              </div>

              {/* Risk Management Section */}
              <div
                style={{
                  padding: 20,
                  background: '#fff5f5',
                  borderRadius: 12,
                  border: '1px solid #fed7d7',
                }}
              >
                <h4
                  style={{
                    margin: '0 0 16px 0',
                    fontSize: 18,
                    color: '#c53030',
                    fontWeight: '600',
                  }}
                >
                  ⚡ Risk Management
                </h4>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 20,
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: 8,
                        fontWeight: '600',
                        fontSize: 14,
                        color: '#fff', // changed from #495057 to white
                      }}
                    >
                      Minimum Agent Score (0-100)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      placeholder="e.g., 40"
                      value={newSessionSettings.minAgentScore}
                      onChange={(e) =>
                        setNewSessionSettings({
                          ...newSessionSettings,
                          minAgentScore: parseInt(e.target.value) || 0,
                        })
                      }
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        background: '#23263a', // dark background
                        color: '#fff', // white text
                        border: '2px solid #444', // higher-contrast border
                        borderRadius: 8,
                        fontSize: 16,
                        outline: 'none',
                        transition: 'border-color 0.2s',
                      }}
                      onFocus={(e) => (e.target.style.borderColor = '#00eaff')}
                      onBlur={(e) => (e.target.style.borderColor = '#444')}
                    />
                    <small style={{ color: '#6c757d', fontSize: 12 }}>
                      Only trade tokens with this minimum confidence
                    </small>
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: 8,
                        fontWeight: '600',
                        fontSize: 14,
                        color: '#fff', // changed from #495057 to white
                      }}
                    >
                      Max Risk Exposure (0.1 = 10%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      placeholder="e.g., 0.3"
                      value={newSessionSettings.maxRiskExposure}
                      onChange={(e) =>
                        setNewSessionSettings({
                          ...newSessionSettings,
                          maxRiskExposure: parseFloat(e.target.value) || 0,
                        })
                      }
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        background: '#23263a', // dark background
                        color: '#fff', // white text
                        border: '2px solid #444', // higher-contrast border
                        borderRadius: 8,
                        fontSize: 16,
                        outline: 'none',
                        transition: 'border-color 0.2s',
                      }}
                      onFocus={(e) => (e.target.style.borderColor = '#00eaff')}
                      onBlur={(e) => (e.target.style.borderColor = '#444')}
                    />
                    <small style={{ color: '#6c757d', fontSize: 12 }}>
                      Maximum percentage in high-risk tokens
                    </small>
                  </div>
                </div>

                <div style={{ marginTop: 20 }}>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: 12,
                      fontWeight: '600',
                      fontSize: 14,
                      color: '#fff', // changed from #495057 to white
                    }}
                  >
                    Allowed Risk Categories:
                  </label>
                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                    {riskOptions.map((risk) => (
                      <label
                        key={risk.value}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '12px 16px',
                          background:
                            newSessionSettings.allowedRiskCategories.includes(
                              risk.value
                            )
                              ? risk.bg
                              : '#f8f9fa',
                          border: `2px solid ${newSessionSettings.allowedRiskCategories.includes(risk.value) ? risk.color : '#e9ecef'}`,
                          borderRadius: 8,
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          fontSize: 14,
                          fontWeight: '500',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={newSessionSettings.allowedRiskCategories.includes(
                            risk.value
                          )}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewSessionSettings({
                                ...newSessionSettings,
                                allowedRiskCategories: [
                                  ...newSessionSettings.allowedRiskCategories,
                                  risk.value,
                                ],
                              });
                            } else {
                              setNewSessionSettings({
                                ...newSessionSettings,
                                allowedRiskCategories:
                                  newSessionSettings.allowedRiskCategories.filter(
                                    (r) => r !== risk.value
                                  ),
                              });
                            }
                          }}
                          style={{ accentColor: risk.color }}
                        />
                        {risk.label}
                      </label>
                    ))}
                  </div>
                  <small
                    style={{
                      color: '#6c757d',
                      fontSize: 12,
                      marginTop: 8,
                      display: 'block',
                    }}
                  >
                    Select which risk levels the agent can trade
                  </small>
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 16,
                marginTop: 32,
                justifyContent: 'center',
              }}
            >
              <button
                className="modal-btn"
                onClick={createInvestmentSession}
                disabled={loading}
              >
                {loading
                  ? '⏳ Creating Session...'
                  : '🚀 Create Investment Session'}
              </button>
              <button
                className="modal-btn"
                style={{ background: '#ff0066', color: '#fff' }}
                onClick={() => setShowCreateSession(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
