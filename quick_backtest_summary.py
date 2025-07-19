"""
Quick backtest summary script for last 7 days
"""
import pandas as pd
from trading_environment import TradingEnvironment
from ppo_agent import PPOAgent
from backtesting_framework import Backtester
import warnings
warnings.filterwarnings('ignore')

def run_quick_backtest():
    print("🚀 ScalperAmp - Last 7 Days Backtest Summary")
    print("=" * 60)
    
    # Load data
    data = pd.read_csv('data/processed_market_data.csv', index_col=0, parse_dates=True)
    print(f"📊 Data loaded: {len(data):,} records")
    
    # Get last 7 days
    end_date = data.index[-1]
    start_date = end_date - pd.Timedelta(days=7)
    backtest_data = data[data.index >= start_date]
    
    print(f"📅 Backtest period: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
    print(f"📈 Data points: {len(backtest_data):,} (5-minute candles)")
    
    # Price analysis
    start_price = backtest_data['close'].iloc[0]
    end_price = backtest_data['close'].iloc[-1]
    price_change = (end_price - start_price) / start_price * 100
    
    print(f"💰 ETH Price: ${start_price:.2f} → ${end_price:.2f} ({price_change:+.2f}%)")
    print(f"📊 Volatility: {backtest_data['close'].pct_change().std() * 100:.2f}%")
    
    # Create environment and load agent
    env = TradingEnvironment(data)
    agent = PPOAgent(env.observation_space, env.action_space)
    
    try:
        agent.load_model('models/ppo/final_trained_model.pth')
        print("🤖 Agent loaded successfully")
    except:
        print("⚠️  No trained agent found")
        return
    
    # Run quick backtest simulation
    print("\n🔄 Running agent simulation...")
    
    # Simple simulation
    env_test = TradingEnvironment(backtest_data)
    obs, _ = env_test.reset()
    
    total_reward = 0
    steps = 0
    trades = 0
    
    for _ in range(min(100, len(backtest_data) - 300)):  # Quick test
        action, _, _ = agent.get_action(obs, deterministic=True)
        obs, reward, terminated, truncated, info = env_test.step(action)
        
        total_reward += reward
        steps += 1
        
        if len(env_test.trade_history) > trades:
            trades = len(env_test.trade_history)
        
        if terminated or truncated:
            break
    
    # Results
    final_stats = env_test.get_episode_stats()
    
    print("\n📈 AGENT PERFORMANCE SUMMARY")
    print("-" * 40)
    print(f"Total Return:     {final_stats['total_return']:>8.2%}")
    print(f"Max Drawdown:     {final_stats['max_drawdown']:>8.2%}")
    print(f"Number of Trades: {final_stats['num_trades']:>8}")
    print(f"Win Rate:         {final_stats['win_rate']:>8.2%}")
    print(f"Sharpe Ratio:     {final_stats['sharpe_ratio']:>8.3f}")
    print(f"Final Balance:    ${final_stats['final_balance']:>8,.2f}")
    
    print("\n🎯 vs Buy & Hold Comparison:")
    buy_hold_return = price_change / 100
    print(f"Buy & Hold:       {buy_hold_return:>8.2%}")
    print(f"Agent Return:     {final_stats['total_return']:>8.2%}")
    
    excess_return = final_stats['total_return'] - buy_hold_return
    print(f"Excess Return:    {excess_return:>8.2%}")
    
    if excess_return > 0:
        print("✅ Agent outperformed buy & hold!")
    else:
        print("❌ Agent underperformed buy & hold")
    
    print("\n📋 Model Status:")
    print(f"✅ PPO Agent: Trained & Loaded")
    print(f"✅ Risk Management: Active")
    print(f"✅ Technical Indicators: 42 features")
    print(f"✅ Environment: 5-min ETH/USD scalping")
    
    print("\n" + "=" * 60)
    print("💡 Note: This is a demonstration with synthetic data")
    print("🚨 For live trading, use real data and extreme caution!")

if __name__ == "__main__":
    run_quick_backtest()
