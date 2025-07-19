# ScalperAmp - ETH High-Frequency PPO Trading Agent

A sophisticated Reinforcement Learning trading agent using Proximal Policy Optimization (PPO) for ETH-USD scalping on 5-minute timeframes. This system features advanced neural networks, curriculum learning, meta-learning, and comprehensive risk management.

## System Architecture

### Core Components

1. **Data Collection Pipeline** (`data_collector.py`)
   - Multi-exchange data aggregation (Binance, Coinbase, Kraken)
   - Real-time and historical data processing
   - Technical indicator computation (50+ indicators)
   - Multi-timeframe feature engineering

2. **LSTM Price Prediction** (`lstm_predictor.py`)
   - Attention-based LSTM for price forecasting
   - Multi-task learning (price, volatility, direction)
   - 12-step ahead predictions (1-hour horizon)
   - Confidence estimation

3. **Trading Environment** (`trading_environment.py`)
   - Gym-compatible RL environment
   - Continuous action space for position sizing
   - Realistic transaction costs and slippage
   - Risk-aware reward function

4. **PPO Agent** (`ppo_agent.py`)
   - Actor-Critic architecture with shared features
   - Experience replay buffer with GAE
   - Gradient clipping and learning rate scheduling
   - Model checkpointing and evaluation

5. **Curriculum Learning** (`curriculum_meta_learning.py`)
   - Progressive difficulty training stages
   - Market regime simulation
   - MAML-based meta-learning
   - Task adaptation mechanisms

6. **Risk Management** (`risk_manager.py`)
   - Value-at-Risk (VaR) monitoring
   - Position sizing algorithms (Kelly Criterion)
   - Circuit breakers and stop-losses
   - Real-time risk alerting

7. **Backtesting Framework** (`backtesting_framework.py`)
   - Comprehensive performance analytics
   - Monte Carlo simulations
   - Interactive visualizations
   - Benchmark comparisons

8. **Real-Time Trading** (`real_time_trader.py`)
   - WebSocket market data feeds
   - Exchange API integration
   - Live order management
   - Performance monitoring dashboard

## Quick Start

### Installation

```bash
# Install dependencies
pip install -r requirements.txt

# Set up environment variables
export BINANCE_API_KEY="your_binance_api_key"
export BINANCE_SECRET_KEY="your_binance_secret_key"
export COINBASE_API_KEY="your_coinbase_api_key"
export COINBASE_SECRET_KEY="your_coinbase_secret_key"
```

### Training

```bash
# Full training pipeline (data collection + LSTM + PPO)
python main.py --mode full --timesteps 1000000

# Training only (skip data collection)
python main.py --mode train --skip-data --timesteps 500000

# Training without curriculum learning
python main.py --mode train --no-curriculum --timesteps 500000
```

### Backtesting

```bash
# Run backtest with trained model
python main.py --mode backtest

# Custom date range
python main.py --mode backtest --start-date 2024-01-01 --end-date 2024-12-31
```

### Live Trading

```bash
# WARNING: Use with extreme caution in live markets
python main.py --mode live
```

## Configuration

### Key Parameters (`config.py`)

**Data Collection:**
- `symbol`: "ETH/USDT" (trading pair)
- `base_timeframe`: "5m" (primary timeframe)
- `historical_days`: 365 (data history)
- `lookback_window`: 60 (feature sequence length)

**LSTM Model:**
- `hidden_size`: 128 (LSTM hidden units)
- `num_layers`: 3 (LSTM layers)
- `sequence_length`: 60 (input sequence)
- `prediction_steps`: 12 (output predictions)

**PPO Agent:**
- `learning_rate`: 3e-4
- `batch_size`: 64
- `n_steps`: 2048 (rollout length)
- `clip_range`: 0.2 (PPO clipping)

**Environment:**
- `initial_balance`: 100000.0 (starting capital)
- `max_position_size`: 0.1 (10% max position)
- `transaction_cost`: 0.001 (0.1% per trade)
- `episode_length`: 288 (24 hours of 5-min candles)

**Risk Management:**
- `max_drawdown`: 0.15 (15% max drawdown)
- `daily_loss_limit`: 0.05 (5% daily loss limit)
- `max_portfolio_risk`: 0.02 (2% VaR limit)

## Commands Reference

### Training Commands

```bash
# Data collection only
python -c "import asyncio; from data_collector import DataCollector; asyncio.run(DataCollector().collect_data())"

# LSTM training only
python -c "from lstm_predictor import LSTMPredictor; import pandas as pd; predictor = LSTMPredictor(); data = pd.read_csv('data/processed_market_data.csv', index_col=0, parse_dates=True); X, y = predictor.prepare_data(data); predictor.train(X, y)"

# PPO training only
python -c "from main import ScalperAmp; import asyncio; scalper = ScalperAmp(); scalper.market_data = pd.read_csv('data/processed_market_data.csv', index_col=0, parse_dates=True); scalper.train_ppo_agent()"
```

### Testing Commands

```bash
# Run environment test
python trading_environment.py

# Run agent test
python ppo_agent.py

# Run backtesting test
python backtesting_framework.py

# Risk management test
python risk_manager.py
```

### Monitoring Commands

```bash
# Check model performance
python -c "import torch; checkpoint = torch.load('models/ppo/final_trained_model.pth'); print(checkpoint['training_stats'])"

# View training history
python -c "from ppo_agent import PPOAgent; agent = PPOAgent(obs_space, act_space); agent.load_model('models/ppo/final_trained_model.pth'); agent.plot_training_stats()"
```

## Performance Metrics

### Expected Performance (Backtesting)
- **Sharpe Ratio**: 1.5-2.5 (target range)
- **Max Drawdown**: <15% (risk limit)
- **Win Rate**: 55-65% (typical range)
- **Profit Factor**: >1.3 (minimum viable)
- **Annual Return**: 15-40% (market dependent)

### Risk Metrics
- **VaR (95%)**: <2% daily portfolio risk
- **Volatility**: 15-25% annualized
- **Beta**: 0.8-1.2 vs ETH buy-and-hold
- **Information Ratio**: >0.5

## File Structure

```
ScalperAmp/
├── main.py                      # Main execution script
├── config.py                    # Configuration settings
├── requirements.txt             # Python dependencies
├── AGENT.md                     # This documentation
├── data_collector.py            # Data collection pipeline
├── lstm_predictor.py            # LSTM price prediction
├── trading_environment.py       # RL trading environment
├── ppo_agent.py                 # PPO reinforcement learning agent
├── curriculum_meta_learning.py  # Advanced training methods
├── risk_manager.py              # Risk management system
├── backtesting_framework.py     # Backtesting and evaluation
├── real_time_trader.py          # Live trading interface
├── data/                        # Data storage directory
├── models/                      # Saved models directory
├── logs/                        # Training logs directory
└── reports/                     # Backtest reports directory
```

## Model Files

### Saved Models Location
- PPO Agent: `models/ppo/final_trained_model.pth`
- LSTM Predictor: `models/lstm/lstm_attention.pth`
- Best Performance: `models/ppo/best_reward_model.pth`
- Best Sharpe: `models/ppo/best_sharpe_model.pth`

### Model Loading
```python
from ppo_agent import PPOAgent
from trading_environment import TradingEnvironment

# Load environment to get spaces
env = TradingEnvironment(data)
agent = PPOAgent(env.observation_space, env.action_space)

# Load trained model
agent.load_model('models/ppo/final_trained_model.pth')
```

## Troubleshooting

### Common Issues

1. **CUDA Out of Memory**
   ```bash
   # Reduce batch size in config.py
   config.ppo.batch_size = 32
   config.lstm.batch_size = 32
   ```

2. **API Rate Limits**
   ```bash
   # Increase rate limit delays in data_collector.py
   # Use fewer exchanges simultaneously
   ```

3. **Insufficient Data**
   ```bash
   # Ensure at least 30 days of data
   # Check exchange connectivity
   # Verify API credentials
   ```

4. **Training Instability**
   ```bash
   # Reduce learning rates
   # Increase gradient clipping
   # Use curriculum learning
   ```

### Performance Optimization

1. **GPU Acceleration**
   ```bash
   # Ensure CUDA is available
   python -c "import torch; print(torch.cuda.is_available())"
   ```

2. **Memory Usage**
   ```bash
   # Monitor memory usage
   # Reduce sequence lengths if needed
   # Use mixed precision training
   ```

3. **Training Speed**
   ```bash
   # Use multiple workers for data loading
   # Reduce environment episode length
   # Optimize feature computation
   ```

## Safety Notes

### Live Trading Warnings

⚠️ **CRITICAL SAFETY WARNINGS** ⚠️

1. **Paper Trading First**: Always test with paper trading before live deployment
2. **Position Limits**: Never risk more than you can afford to lose
3. **API Security**: Keep API keys secure and use IP restrictions
4. **Monitoring**: Implement real-time monitoring and alerts
5. **Circuit Breakers**: Ensure risk limits are properly configured

### Risk Management

- Maximum position size: 10% of portfolio
- Daily loss limit: 5% of portfolio
- Stop-loss on all positions
- Real-time VaR monitoring
- Automatic trading halt on excessive losses

## Support and Maintenance

### Regular Maintenance Tasks

1. **Model Retraining**: Monthly retraining with new data
2. **Performance Review**: Weekly performance analysis
3. **Risk Assessment**: Daily risk metric review
4. **Data Quality**: Continuous data quality monitoring

### Monitoring Checklist

- [ ] Model performance within expected ranges
- [ ] Risk metrics below thresholds
- [ ] Data feeds operational
- [ ] API connectivity stable
- [ ] No critical alerts active

### Version Control

- Model versioning with performance tracking
- Configuration backup and restore
- Training run reproducibility
- Performance benchmark maintenance

---

*This agent is for educational and research purposes. Trading cryptocurrencies involves substantial risk and may not be suitable for all investors. Past performance does not guarantee future results.*
