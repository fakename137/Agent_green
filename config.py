"""
Configuration settings for the ETH scalping trading agent
"""
import os
from dataclasses import dataclass
from typing import Dict, List, Tuple

@dataclass
class DataConfig:
    """Data collection and preprocessing configuration"""
    # Trading pair and timeframes
    symbol: str = "ETH/USDT"
    base_timeframe: str = "5m"
    additional_timeframes: List[str] = None
    
    # Data sources
    exchanges: List[str] = None
    data_dir: str = "data"
    historical_days: int = 365
    
    # Technical indicators
    indicators: List[str] = None
    
    # Feature engineering
    lookback_window: int = 60
    prediction_horizon: int = 12  # 1 hour ahead (12 * 5min)
    
    def __post_init__(self):
        if self.additional_timeframes is None:
            self.additional_timeframes = ["1m", "15m", "1h"]
        if self.exchanges is None:
            self.exchanges = ["binance", "coinbase", "kraken"]
        if self.indicators is None:
            self.indicators = [
                "sma", "ema", "rsi", "macd", "bollinger",
                "stoch", "atr", "obv", "vwap", "cci"
            ]

@dataclass
class LSTMConfig:
    """LSTM price prediction model configuration"""
    # Architecture
    hidden_size: int = 128
    num_layers: int = 3
    dropout: float = 0.2
    bidirectional: bool = True
    
    # Training
    batch_size: int = 64
    learning_rate: float = 0.001
    epochs: int = 100
    patience: int = 15
    
    # Sequence parameters
    sequence_length: int = 60
    prediction_steps: int = 12
    
    # Regularization
    weight_decay: float = 1e-5
    gradient_clip: float = 1.0

@dataclass
class PPOConfig:
    """PPO agent configuration"""
    # Network architecture
    policy_layers: List[int] = None
    value_layers: List[int] = None
    activation: str = "relu"
    
    # PPO hyperparameters
    learning_rate: float = 3e-4
    batch_size: int = 64
    n_steps: int = 2048
    n_epochs: int = 10
    gamma: float = 0.99
    gae_lambda: float = 0.95
    clip_range: float = 0.2
    ent_coef: float = 0.01
    vf_coef: float = 0.5
    max_grad_norm: float = 0.5
    
    # Exploration
    exploration_schedule: str = "linear"
    initial_exploration: float = 1.0
    final_exploration: float = 0.1
    exploration_fraction: float = 0.8
    
    def __post_init__(self):
        if self.policy_layers is None:
            self.policy_layers = [256, 256, 128]
        if self.value_layers is None:
            self.value_layers = [256, 256, 128]

@dataclass
class EnvironmentConfig:
    """Trading environment configuration"""
    # Trading parameters
    initial_balance: float = 100000.0
    max_position_size: float = 0.1  # 10% of balance
    transaction_cost: float = 0.001  # 0.1% per trade
    slippage: float = 0.0005  # 0.05%
    
    # Risk management
    max_drawdown: float = 0.15  # 15%
    stop_loss: float = 0.02  # 2%
    take_profit: float = 0.03  # 3%
    max_daily_trades: int = 100
    
    # Reward function
    reward_scaling: float = 1000.0
    risk_penalty: float = 0.1
    holding_penalty: float = 0.001
    trade_frequency_penalty: float = 0.01
    
    # Episode parameters
    episode_length: int = 720  # 60 hours of 5-min candles (2.5 days) - EXTENDED FOR BETTER LEARNING
    warmup_period: int = 60

@dataclass
class RiskConfig:
    """Risk management configuration"""
    # Position sizing
    kelly_fraction: float = 0.25
    max_leverage: float = 1.0
    correlation_threshold: float = 0.7
    
    # Portfolio limits
    max_portfolio_risk: float = 0.02  # 2% VaR
    concentration_limit: float = 0.3  # 30% max in single position
    
    # Stop losses
    trailing_stop: bool = True
    dynamic_stops: bool = True
    volatility_multiplier: float = 2.0
    
    # Circuit breakers
    daily_loss_limit: float = 0.05  # 5%
    consecutive_loss_limit: int = 5
    drawdown_limit: float = 0.1  # 10%

@dataclass
class CurriculumConfig:
    """Curriculum learning configuration"""
    # Stage definitions
    stages: List[Dict] = None
    stage_episodes: List[int] = None
    difficulty_metrics: List[str] = None
    
    # Adaptation parameters
    success_threshold: float = 0.7
    adaptation_rate: float = 0.1
    min_stage_episodes: int = 1000
    
    def __post_init__(self):
        if self.stages is None:
            self.stages = [
                {"volatility": "low", "trend": "strong", "noise": 0.1},
                {"volatility": "medium", "trend": "medium", "noise": 0.3},
                {"volatility": "high", "trend": "weak", "noise": 0.5},
                {"volatility": "mixed", "trend": "mixed", "noise": 0.7}
            ]
        if self.stage_episodes is None:
            self.stage_episodes = [5000, 7500, 10000, 15000]
        if self.difficulty_metrics is None:
            self.difficulty_metrics = ["sharpe_ratio", "max_drawdown", "win_rate"]

@dataclass
class MetaLearningConfig:
    """Meta-learning configuration"""
    # MAML parameters
    inner_lr: float = 0.01
    meta_lr: float = 0.001
    inner_steps: int = 5
    meta_batch_size: int = 8
    
    # Task distribution
    task_types: List[str] = None
    task_adaptation_steps: int = 10
    
    # Memory and adaptation
    memory_size: int = 10000
    adaptation_threshold: float = 0.1
    
    def __post_init__(self):
        if self.task_types is None:
            self.task_types = [
                "trending_up", "trending_down", "sideways",
                "high_volatility", "low_volatility", "news_events"
            ]

@dataclass
class BacktestConfig:
    """Backtesting configuration"""
    # Data splits
    train_start: str = "2022-01-01"
    train_end: str = "2023-06-30"
    val_start: str = "2023-07-01"
    val_end: str = "2023-12-31"
    test_start: str = "2024-01-01"
    test_end: str = "2024-12-31"
    
    # Metrics
    benchmark: str = "buy_hold"
    risk_free_rate: float = 0.02
    confidence_intervals: List[float] = None
    
    # Monte Carlo
    mc_simulations: int = 1000
    bootstrap_samples: int = 500
    
    def __post_init__(self):
        if self.confidence_intervals is None:
            self.confidence_intervals = [0.90, 0.95, 0.99]

@dataclass
class Config:
    """Main configuration class"""
    data: DataConfig = None
    lstm: LSTMConfig = None
    ppo: PPOConfig = None
    environment: EnvironmentConfig = None
    risk: RiskConfig = None
    curriculum: CurriculumConfig = None
    meta_learning: MetaLearningConfig = None
    backtest: BacktestConfig = None
    
    # General settings
    device: str = "cuda"  # Will be auto-detected
    random_seed: int = 42
    log_level: str = "INFO"
    save_dir: str = "models"
    log_dir: str = "logs"
    
    # API keys (set via environment variables)
    binance_api_key: str = ""
    binance_secret_key: str = ""
    coinbase_api_key: str = ""
    coinbase_secret_key: str = ""
    alpha_vantage_key: str = ""
    
    def __post_init__(self):
        if self.data is None:
            self.data = DataConfig()
        if self.lstm is None:
            self.lstm = LSTMConfig()
        if self.ppo is None:
            self.ppo = PPOConfig()
        if self.environment is None:
            self.environment = EnvironmentConfig()
        if self.risk is None:
            self.risk = RiskConfig()
        if self.curriculum is None:
            self.curriculum = CurriculumConfig()
        if self.meta_learning is None:
            self.meta_learning = MetaLearningConfig()
        if self.backtest is None:
            self.backtest = BacktestConfig()
            
        # Load API keys from environment
        self.binance_api_key = os.getenv("BINANCE_API_KEY", "")
        self.binance_secret_key = os.getenv("BINANCE_SECRET_KEY", "")
        self.coinbase_api_key = os.getenv("COINBASE_API_KEY", "")
        self.coinbase_secret_key = os.getenv("COINBASE_SECRET_KEY", "")
        self.alpha_vantage_key = os.getenv("ALPHA_VANTAGE_API_KEY", "")

# Global configuration instance
config = Config()
