"""
Trading environment for reinforcement learning training
"""
import gymnasium as gym
from gymnasium import spaces
import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Optional, Any
import logging
from enum import Enum
from dataclasses import dataclass
from config import config
from trading_strategies import TradingStrategies

logging.basicConfig(level=getattr(logging, config.log_level))
logger = logging.getLogger(__name__)

class Action(Enum):
    """Trading actions"""
    HOLD = 0
    BUY = 1
    SELL = 2

@dataclass
class Position:
    """Trading position information"""
    size: float = 0.0  # Position size (-1 to 1, negative = short)
    entry_price: float = 0.0
    entry_timestamp: int = 0
    unrealized_pnl: float = 0.0
    realized_pnl: float = 0.0

@dataclass
class TradeInfo:
    """Information about a completed trade"""
    action: str
    size: float
    price: float
    timestamp: int
    pnl: float
    fees: float

class TradingEnvironment(gym.Env):
    """
    Gym environment for cryptocurrency trading with PPO
    Supports continuous action space for position sizing
    """
    
    def __init__(self, 
                 data: pd.DataFrame,
                 lstm_predictor=None,
                 start_idx: int = None,
                 end_idx: int = None):
        super().__init__()
        
        self.data = data.copy()
        self.lstm_predictor = lstm_predictor
        
        # Episode boundaries
        self.start_idx = start_idx or config.environment.warmup_period
        self.end_idx = end_idx or len(data) - 1
        self.max_episode_steps = min(
            config.environment.episode_length,
            self.end_idx - self.start_idx
        )
        
        # State variables
        self.current_idx = self.start_idx
        self.episode_start_idx = self.start_idx
        self.balance = config.environment.initial_balance
        self.initial_balance = config.environment.initial_balance
        self.position = Position()
        self.trade_history: List[TradeInfo] = []
        
        # Episode statistics
        self.episode_trades = 0
        self.episode_profit = 0.0
        self.max_drawdown = 0.0
        self.peak_balance = self.initial_balance
        
        # Feature columns (exclude price columns and metadata)
        self.feature_columns = [col for col in data.columns 
                               if col not in ['open', 'high', 'low', 'close', 'volume', 'exchange']
                               and data[col].dtype in ['float64', 'int64']]
        
        # Action and observation spaces
        self._setup_spaces()
        
        logger.info(f"Trading environment initialized with {len(self.feature_columns)} features")
    
    def _setup_spaces(self):
        """Setup action and observation spaces"""
        
        # Continuous action space: [position_change, stop_loss, take_profit]
        # position_change: -1 (full sell) to +1 (full buy)
        # stop_loss: 0 to 1 (percentage below current price)
        # take_profit: 0 to 1 (percentage above current price)
        self.action_space = spaces.Box(
            low=np.array([-1.0, 0.0, 0.0]),
            high=np.array([1.0, 0.1, 0.1]),  # Max 10% stop/take profit
            dtype=np.float32
        )
        
        # Observation space dimensions
        # Market features + LSTM predictions + position info + market state
        market_features = len(self.feature_columns)
        lstm_features = config.lstm.prediction_steps  # Always allocate space for LSTM features
        position_features = 8  # position, pnl, drawdown, etc.
        market_state_features = 12  # volatility, trend, momentum, etc.
        
        total_features = market_features + lstm_features + position_features + market_state_features
        
        self.observation_space = spaces.Box(
            low=-np.inf,
            high=np.inf,
            shape=(total_features,),
            dtype=np.float32
        )
    
    def reset(self, seed=None, options=None) -> Tuple[np.ndarray, Dict]:
        """Reset environment for new episode"""
        
        super().reset(seed=seed)
        
        # Reset episode parameters
        if options and 'start_idx' in options:
            self.episode_start_idx = options['start_idx']
        else:
            # Random start position for training diversity
            max_start = self.end_idx - self.max_episode_steps
            self.episode_start_idx = np.random.randint(self.start_idx, max_start)
        
        self.current_idx = self.episode_start_idx
        self.balance = self.initial_balance
        self.position = Position()
        self.trade_history = []
        
        # Reset episode statistics
        self.episode_trades = 0
        self.episode_profit = 0.0
        self.max_drawdown = 0.0
        self.peak_balance = self.initial_balance
        
        # Get initial observation
        observation = self._get_observation()
        info = self._get_info()
        
        return observation, info
    
    def step(self, action: np.ndarray) -> Tuple[np.ndarray, float, bool, bool, Dict]:
        """Execute trading action and return results"""
        
        # Parse action
        position_change = action[0]  # -1 to 1
        stop_loss_pct = action[1]    # 0 to 0.1
        take_profit_pct = action[2]  # 0 to 0.1
        
        # Current market data
        current_data = self.data.iloc[self.current_idx]
        current_price = current_data['close']
        
        # Calculate new position size
        current_position_size = self.position.size
        new_position_size = np.clip(
            current_position_size + position_change * config.environment.max_position_size,
            -config.environment.max_position_size,
            config.environment.max_position_size
        )
        
        # Execute trade if position changes
        trade_executed = False
        if abs(new_position_size - current_position_size) > 1e-6:
            trade_executed = self._execute_trade(new_position_size, current_price)
        
        # Check stop loss and take profit
        if self.position.size != 0:
            self._check_stops(current_price, stop_loss_pct, take_profit_pct)
        
        # Update position PnL
        self._update_position_pnl(current_price)
        
        # Calculate reward
        reward = self._calculate_reward(trade_executed, current_price)
        
        # Update episode statistics
        self._update_episode_stats()
        
        # Move to next step
        self.current_idx += 1
        
        # Check if episode is done
        terminated = self.current_idx >= self.episode_start_idx + self.max_episode_steps
        truncated = (
            self.current_idx >= self.end_idx or
            self._check_risk_limits() or
            self.balance <= 0
        )
        
        # Get new observation
        observation = self._get_observation()
        info = self._get_info()
        
        return observation, reward, terminated, truncated, info
    
    def _execute_trade(self, new_position_size: float, price: float) -> bool:
        """Execute a trading order"""
        
        size_change = new_position_size - self.position.size
        
        if abs(size_change) < 1e-6:
            return False
        
        # Check daily trade limit
        if self.episode_trades >= config.environment.max_daily_trades:
            return False
        
        # Calculate trade value
        trade_value = abs(size_change) * self.balance
        
        # Apply transaction costs
        fees = trade_value * config.environment.transaction_cost
        
        # Apply slippage
        slippage_factor = 1 + config.environment.slippage * np.sign(size_change)
        effective_price = price * slippage_factor
        
        # Update position
        if self.position.size == 0:
            # Opening new position
            self.position.size = new_position_size
            self.position.entry_price = effective_price
            self.position.entry_timestamp = self.current_idx
        else:
            # Modifying existing position
            if np.sign(new_position_size) != np.sign(self.position.size):
                # Position reversal - close and open opposite
                self._close_position(effective_price)
                if new_position_size != 0:
                    self.position.size = new_position_size
                    self.position.entry_price = effective_price
                    self.position.entry_timestamp = self.current_idx
            else:
                # Adding to position
                weighted_price = (
                    self.position.entry_price * abs(self.position.size) +
                    effective_price * abs(size_change)
                ) / abs(new_position_size)
                self.position.entry_price = weighted_price
                self.position.size = new_position_size
        
        # Update balance
        self.balance -= fees
        
        # Record trade
        action_str = "BUY" if size_change > 0 else "SELL"
        trade_info = TradeInfo(
            action=action_str,
            size=abs(size_change),
            price=effective_price,
            timestamp=self.current_idx,
            pnl=0.0,  # Will be calculated when position is closed
            fees=fees
        )
        self.trade_history.append(trade_info)
        self.episode_trades += 1
        
        return True
    
    def _close_position(self, price: float):
        """Close current position"""
        
        if self.position.size == 0:
            return
        
        # Calculate realized PnL
        if self.position.size > 0:  # Long position
            pnl = (price - self.position.entry_price) * abs(self.position.size) * self.balance
        else:  # Short position
            pnl = (self.position.entry_price - price) * abs(self.position.size) * self.balance
        
        self.position.realized_pnl += pnl
        self.balance += pnl
        
        # Reset position
        self.position.size = 0.0
        self.position.entry_price = 0.0
        self.position.unrealized_pnl = 0.0
    
    def _update_position_pnl(self, current_price: float):
        """Update unrealized PnL"""
        
        if self.position.size == 0:
            self.position.unrealized_pnl = 0.0
            return
        
        if self.position.size > 0:  # Long position
            pnl = (current_price - self.position.entry_price) * abs(self.position.size) * self.balance
        else:  # Short position
            pnl = (self.position.entry_price - current_price) * abs(self.position.size) * self.balance
        
        self.position.unrealized_pnl = pnl
    
    def _check_stops(self, current_price: float, stop_loss_pct: float, take_profit_pct: float):
        """Check stop loss and take profit levels"""
        
        if self.position.size == 0:
            return
        
        # Calculate stop levels
        if self.position.size > 0:  # Long position
            stop_loss_price = self.position.entry_price * (1 - stop_loss_pct)
            take_profit_price = self.position.entry_price * (1 + take_profit_pct)
            
            if current_price <= stop_loss_price or current_price >= take_profit_price:
                self._close_position(current_price)
        else:  # Short position
            stop_loss_price = self.position.entry_price * (1 + stop_loss_pct)
            take_profit_price = self.position.entry_price * (1 - take_profit_pct)
            
            if current_price >= stop_loss_price or current_price <= take_profit_price:
                self._close_position(current_price)
    
    def _calculate_reward(self, trade_executed: bool, current_price: float) -> float:
        """Calculate reward for the current step"""
        
        # Base reward from portfolio change
        total_value = self.balance + self.position.unrealized_pnl
        portfolio_return = (total_value - self.initial_balance) / self.initial_balance
        
        # Scale base reward
        reward = portfolio_return * config.environment.reward_scaling
        
        # Risk penalties
        current_drawdown = self._calculate_drawdown()
        if current_drawdown > config.environment.max_drawdown:
            reward -= config.environment.risk_penalty * abs(current_drawdown)
        
        # Holding penalty (encourage action)
        if self.position.size == 0:
            reward -= config.environment.holding_penalty
        
        # Trading frequency penalty
        if trade_executed:
            trade_frequency = self.episode_trades / max(1, self.current_idx - self.episode_start_idx)
            if trade_frequency > 0.1:  # More than 10% of steps
                reward -= config.environment.trade_frequency_penalty
        
        # Volatility-adjusted reward
        if len(self.trade_history) > 10:
            recent_returns = [t.pnl for t in self.trade_history[-10:]]
            if len(recent_returns) > 1:
                volatility = np.std(recent_returns)
                if volatility > 0:
                    reward = reward / (1 + volatility)
        
        return reward
    
    def _calculate_drawdown(self) -> float:
        """Calculate current drawdown"""
        
        total_value = self.balance + self.position.unrealized_pnl
        self.peak_balance = max(self.peak_balance, total_value)
        
        if self.peak_balance > 0:
            drawdown = (self.peak_balance - total_value) / self.peak_balance
        else:
            drawdown = 0.0
        
        self.max_drawdown = max(self.max_drawdown, drawdown)
        return drawdown
    
    def _check_risk_limits(self) -> bool:
        """Check if risk limits are breached"""
        
        # Maximum drawdown check
        if self.max_drawdown > config.environment.max_drawdown:
            return True
        
        # Daily loss limit
        daily_pnl = (self.balance + self.position.unrealized_pnl - self.initial_balance) / self.initial_balance
        if daily_pnl < -config.risk.daily_loss_limit:
            return True
        
        # Consecutive loss limit
        if len(self.trade_history) >= config.risk.consecutive_loss_limit:
            recent_trades = self.trade_history[-config.risk.consecutive_loss_limit:]
            if all(trade.pnl < 0 for trade in recent_trades):
                return True
        
        return False
    
    def _update_episode_stats(self):
        """Update episode statistics"""
        
        total_value = self.balance + self.position.unrealized_pnl
        self.episode_profit = total_value - self.initial_balance
    
    def _get_observation(self) -> np.ndarray:
        """Get current observation state"""
        
        current_data = self.data.iloc[self.current_idx]
        
        # Market features
        market_features = current_data[self.feature_columns].values.astype(np.float32)
        
        # LSTM predictions (if available)
        lstm_features = np.zeros(config.lstm.prediction_steps, dtype=np.float32)
        if self.lstm_predictor is not None:
            try:
                # Get recent sequence for LSTM prediction
                start_idx = max(0, self.current_idx - config.lstm.sequence_length)
                sequence_data = self.data.iloc[start_idx:self.current_idx]
                
                if len(sequence_data) >= config.lstm.sequence_length:
                    # Prepare sequence for LSTM
                    sequence_features = sequence_data[self.feature_columns].values
                    sequence_features = sequence_features.reshape(1, -1, len(self.feature_columns))
                    
                    predictions, _ = self.lstm_predictor.predict(sequence_features)
                    lstm_features = predictions[0].astype(np.float32)
            except Exception as e:
                logger.warning(f"LSTM prediction failed: {e}")
        
        # Position features
        total_value = self.balance + self.position.unrealized_pnl
        position_features = np.array([
            self.position.size,
            self.position.unrealized_pnl / self.initial_balance,
            self.position.realized_pnl / self.initial_balance,
            total_value / self.initial_balance,
            self.max_drawdown,
            self.episode_trades / config.environment.max_daily_trades,
            len(self.trade_history) / 100,  # Normalized trade count
            (self.current_idx - self.episode_start_idx) / self.max_episode_steps
        ], dtype=np.float32)
        
        # Market state features (rolling statistics)
        window_size = min(20, self.current_idx - self.episode_start_idx + 1)
        if window_size > 1:
            recent_data = self.data.iloc[self.current_idx-window_size+1:self.current_idx+1]
            
            price_change = (current_data['close'] - recent_data['close'].iloc[0]) / recent_data['close'].iloc[0]
            volatility = recent_data['close'].pct_change().std()
            volume_ratio = current_data['volume'] / recent_data['volume'].mean()
            
            # Trend indicators
            sma_5 = recent_data['close'].rolling(min(5, window_size)).mean().iloc[-1]
            sma_20 = recent_data['close'].rolling(min(20, window_size)).mean().iloc[-1]
            trend = (current_data['close'] - sma_5) / sma_5 if sma_5 > 0 else 0
            
            market_state_features = np.array([
                price_change,
                volatility if not np.isnan(volatility) else 0,
                volume_ratio if not np.isnan(volume_ratio) else 1,
                trend if not np.isnan(trend) else 0,
                (current_data['close'] - sma_20) / sma_20 if sma_20 > 0 else 0,
                current_data.get('rsi', 50) / 100,  # Normalized RSI
                current_data.get('macd', 0),
                current_data.get('bb_percent', 0.5),
                current_data.get('atr', 0) / current_data['close'],
                current_data.get('obv', 0) / 1e6,  # Normalized OBV
                current_data['hour_sin'] if 'hour_sin' in current_data else 0,
                current_data['hour_cos'] if 'hour_cos' in current_data else 0
            ], dtype=np.float32)
        else:
            market_state_features = np.zeros(12, dtype=np.float32)
        
        # Combine all features
        observation = np.concatenate([
            market_features,
            lstm_features,
            position_features,
            market_state_features
        ])
        
        # Handle any NaN values
        observation = np.nan_to_num(observation, nan=0.0, posinf=1e6, neginf=-1e6)
        
        return observation
    
    def _get_info(self) -> Dict:
        """Get additional information"""
        
        total_value = self.balance + self.position.unrealized_pnl
        
        return {
            'balance': self.balance,
            'position_size': self.position.size,
            'unrealized_pnl': self.position.unrealized_pnl,
            'realized_pnl': self.position.realized_pnl,
            'total_value': total_value,
            'return': (total_value - self.initial_balance) / self.initial_balance,
            'max_drawdown': self.max_drawdown,
            'episode_trades': self.episode_trades,
            'current_price': self.data.iloc[self.current_idx]['close'],
            'timestamp': self.data.index[self.current_idx]
        }
    
    def get_episode_stats(self) -> Dict:
        """Get detailed episode statistics"""
        
        total_value = self.balance + self.position.unrealized_pnl
        total_return = (total_value - self.initial_balance) / self.initial_balance
        
        if len(self.trade_history) > 0:
            winning_trades = [t for t in self.trade_history if t.pnl > 0]
            win_rate = len(winning_trades) / len(self.trade_history)
            
            if winning_trades:
                avg_win = np.mean([t.pnl for t in winning_trades])
            else:
                avg_win = 0
            
            losing_trades = [t for t in self.trade_history if t.pnl < 0]
            if losing_trades:
                avg_loss = np.mean([t.pnl for t in losing_trades])
            else:
                avg_loss = 0
        else:
            win_rate = 0
            avg_win = 0
            avg_loss = 0
        
        return {
            'total_return': total_return,
            'max_drawdown': self.max_drawdown,
            'win_rate': win_rate,
            'num_trades': len(self.trade_history),
            'avg_win': avg_win,
            'avg_loss': avg_loss,
            'profit_factor': abs(avg_win / avg_loss) if avg_loss != 0 else float('inf'),
            'sharpe_ratio': self._calculate_sharpe_ratio(),
            'final_balance': total_value
        }
    
    def _calculate_sharpe_ratio(self) -> float:
        """Calculate Sharpe ratio"""
        
        if len(self.trade_history) < 2:
            return 0.0
        
        returns = [t.pnl / self.initial_balance for t in self.trade_history]
        
        if len(returns) < 2:
            return 0.0
        
        mean_return = np.mean(returns)
        std_return = np.std(returns)
        
        if std_return == 0:
            return 0.0
        
        # Assume risk-free rate of 2% annually, adjusted for trading frequency
        risk_free_rate = 0.02 / (365 * 24 * 12)  # Per 5-minute period
        
        return (mean_return - risk_free_rate) / std_return

if __name__ == "__main__":
    # Example usage
    from data_collector import DataCollector
    import asyncio
    
    # Collect data
    collector = DataCollector()
    data = asyncio.run(collector.collect_data())
    
    # Create environment
    env = TradingEnvironment(data)
    
    # Test environment
    obs, info = env.reset()
    print(f"Observation shape: {obs.shape}")
    print(f"Action space: {env.action_space}")
    
    # Run random episode
    total_reward = 0
    for _ in range(100):
        action = env.action_space.sample()
        obs, reward, terminated, truncated, info = env.step(action)
        total_reward += reward
        
        if terminated or truncated:
            break
    
    print(f"Episode finished with total reward: {total_reward}")
    print(f"Episode stats: {env.get_episode_stats()}")
