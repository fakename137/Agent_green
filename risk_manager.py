"""
Comprehensive risk management system for trading agent
"""
import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Optional, Any
import logging
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime, timedelta
import warnings
from scipy import stats
from config import config

logging.basicConfig(level=getattr(logging, config.log_level))
logger = logging.getLogger(__name__)

class RiskLevel(Enum):
    """Risk level classifications"""
    LOW = 1
    MEDIUM = 2
    HIGH = 3
    CRITICAL = 4

class AlertType(Enum):
    """Risk alert types"""
    POSITION_SIZE = "position_size"
    DRAWDOWN = "drawdown"
    VOLATILITY = "volatility"
    CORRELATION = "correlation"
    VAR_BREACH = "var_breach"
    LEVERAGE = "leverage"
    CONCENTRATION = "concentration"
    LOSS_STREAK = "loss_streak"

@dataclass
class RiskAlert:
    """Risk alert object"""
    alert_type: AlertType
    level: RiskLevel
    message: str
    value: float
    threshold: float
    timestamp: datetime = field(default_factory=datetime.now)
    action_required: bool = False

@dataclass
class PositionRisk:
    """Position risk metrics"""
    position_size: float
    market_value: float
    unrealized_pnl: float
    var_1d: float
    var_5d: float
    volatility: float
    beta: float
    sharpe_ratio: float
    max_drawdown: float
    time_in_position: int

class RiskMetrics:
    """Risk metrics calculator"""
    
    def __init__(self):
        self.confidence_levels = [0.95, 0.99]
        self.var_window = 252  # 1 year for VaR calculation
    
    def calculate_var(self, returns: np.ndarray, confidence_level: float = 0.95, 
                     window: int = None) -> float:
        """Calculate Value at Risk"""
        
        if window is None:
            window = self.var_window
        
        if len(returns) < 30:  # Minimum data requirement
            return 0.0
        
        # Use recent returns for VaR calculation
        recent_returns = returns[-window:] if len(returns) > window else returns
        
        # Parametric VaR (assuming normal distribution)
        mean_return = np.mean(recent_returns)
        std_return = np.std(recent_returns)
        
        # Z-score for confidence level
        z_score = stats.norm.ppf(1 - confidence_level)
        
        # VaR calculation
        var = -(mean_return + z_score * std_return)
        
        return max(0, var)
    
    def calculate_cvar(self, returns: np.ndarray, confidence_level: float = 0.95) -> float:
        """Calculate Conditional Value at Risk (Expected Shortfall)"""
        
        if len(returns) < 30:
            return 0.0
        
        var = self.calculate_var(returns, confidence_level)
        
        # CVaR is the expected loss beyond VaR
        tail_losses = returns[returns <= -var]
        
        if len(tail_losses) > 0:
            cvar = -np.mean(tail_losses)
        else:
            cvar = var
        
        return cvar
    
    def calculate_maximum_drawdown(self, equity_curve: np.ndarray) -> Tuple[float, int, int]:
        """Calculate maximum drawdown and duration"""
        
        if len(equity_curve) < 2:
            return 0.0, 0, 0
        
        # Calculate running maximum
        running_max = np.maximum.accumulate(equity_curve)
        
        # Calculate drawdown
        drawdown = (equity_curve - running_max) / running_max
        
        # Find maximum drawdown
        max_dd = np.min(drawdown)
        max_dd_idx = np.argmin(drawdown)
        
        # Find start of drawdown period
        start_idx = 0
        for i in range(max_dd_idx, -1, -1):
            if drawdown[i] == 0:
                start_idx = i
                break
        
        # Find end of drawdown period
        end_idx = len(drawdown) - 1
        for i in range(max_dd_idx, len(drawdown)):
            if drawdown[i] == 0:
                end_idx = i
                break
        
        duration = end_idx - start_idx
        
        return abs(max_dd), start_idx, duration
    
    def calculate_sharpe_ratio(self, returns: np.ndarray, risk_free_rate: float = 0.02) -> float:
        """Calculate Sharpe ratio"""
        
        if len(returns) < 2:
            return 0.0
        
        mean_return = np.mean(returns)
        std_return = np.std(returns)
        
        if std_return == 0:
            return 0.0
        
        # Annualized Sharpe ratio
        excess_return = mean_return - risk_free_rate / 252  # Daily risk-free rate
        sharpe = (excess_return * np.sqrt(252)) / (std_return * np.sqrt(252))
        
        return sharpe
    
    def calculate_beta(self, asset_returns: np.ndarray, market_returns: np.ndarray) -> float:
        """Calculate beta relative to market"""
        
        if len(asset_returns) < 30 or len(market_returns) < 30:
            return 1.0
        
        # Align arrays
        min_len = min(len(asset_returns), len(market_returns))
        asset_returns = asset_returns[-min_len:]
        market_returns = market_returns[-min_len:]
        
        # Calculate covariance and variance
        covariance = np.cov(asset_returns, market_returns)[0, 1]
        market_variance = np.var(market_returns)
        
        if market_variance == 0:
            return 1.0
        
        beta = covariance / market_variance
        
        return beta
    
    def calculate_volatility(self, returns: np.ndarray, window: int = 30) -> float:
        """Calculate rolling volatility"""
        
        if len(returns) < window:
            return np.std(returns) if len(returns) > 1 else 0.0
        
        recent_returns = returns[-window:]
        volatility = np.std(recent_returns) * np.sqrt(252)  # Annualized
        
        return volatility

class PositionSizer:
    """Position sizing based on risk metrics"""
    
    def __init__(self):
        self.max_position_size = config.environment.max_position_size
        self.kelly_fraction = config.risk.kelly_fraction
        
    def kelly_criterion(self, win_rate: float, avg_win: float, avg_loss: float) -> float:
        """Calculate Kelly optimal position size"""
        
        if avg_loss == 0 or win_rate == 0:
            return 0.0
        
        # Kelly formula: f = (bp - q) / b
        # where b = avg_win/avg_loss, p = win_rate, q = 1 - win_rate
        b = abs(avg_win / avg_loss)
        p = win_rate
        q = 1 - win_rate
        
        kelly_f = (b * p - q) / b
        
        # Apply fractional Kelly to reduce risk
        return max(0, min(kelly_f * self.kelly_fraction, self.max_position_size))
    
    def volatility_targeting(self, target_vol: float, asset_vol: float, 
                           base_position: float) -> float:
        """Adjust position size based on volatility targeting"""
        
        if asset_vol == 0:
            return base_position
        
        vol_adjustment = target_vol / asset_vol
        adjusted_position = base_position * vol_adjustment
        
        return max(0, min(adjusted_position, self.max_position_size))
    
    def var_based_sizing(self, var: float, risk_budget: float, 
                        current_portfolio_var: float) -> float:
        """Position sizing based on VaR budget"""
        
        if var == 0:
            return 0.0
        
        # Available risk budget
        available_risk = risk_budget - current_portfolio_var
        
        if available_risk <= 0:
            return 0.0
        
        # Position size that consumes available risk
        position_size = available_risk / var
        
        return max(0, min(position_size, self.max_position_size))

class RiskManager:
    """Main risk management system"""
    
    def __init__(self):
        self.risk_metrics = RiskMetrics()
        self.position_sizer = PositionSizer()
        
        # Risk limits
        self.max_drawdown = config.risk.drawdown_limit
        self.max_daily_loss = config.risk.daily_loss_limit
        self.max_portfolio_var = config.risk.max_portfolio_risk
        self.concentration_limit = config.risk.concentration_limit
        self.max_leverage = config.risk.max_leverage
        
        # Tracking
        self.risk_alerts: List[RiskAlert] = []
        self.position_history: List[Dict] = []
        self.risk_metrics_history: List[Dict] = []
        
        # Circuit breakers
        self.consecutive_losses = 0
        self.daily_loss = 0.0
        self.trading_halted = False
        self.halt_start_time = None
        
        logger.info("Risk management system initialized")
    
    def evaluate_position_risk(self, position_size: float, entry_price: float,
                             current_price: float, returns_history: np.ndarray,
                             market_returns: np.ndarray = None) -> PositionRisk:
        """Evaluate risk metrics for a position"""
        
        # Basic position metrics
        market_value = abs(position_size) * current_price
        unrealized_pnl = position_size * (current_price - entry_price)
        
        # Risk metrics
        var_1d = self.risk_metrics.calculate_var(returns_history, 0.95)
        var_5d = self.risk_metrics.calculate_var(returns_history, 0.99)
        volatility = self.risk_metrics.calculate_volatility(returns_history)
        
        if market_returns is not None:
            beta = self.risk_metrics.calculate_beta(returns_history, market_returns)
        else:
            beta = 1.0
        
        sharpe_ratio = self.risk_metrics.calculate_sharpe_ratio(returns_history)
        
        # Drawdown calculation
        if len(returns_history) > 1:
            equity_curve = np.cumprod(1 + returns_history)
            max_dd, _, _ = self.risk_metrics.calculate_maximum_drawdown(equity_curve)
        else:
            max_dd = 0.0
        
        return PositionRisk(
            position_size=position_size,
            market_value=market_value,
            unrealized_pnl=unrealized_pnl,
            var_1d=var_1d * market_value,
            var_5d=var_5d * market_value,
            volatility=volatility,
            beta=beta,
            sharpe_ratio=sharpe_ratio,
            max_drawdown=max_dd,
            time_in_position=len(returns_history)
        )
    
    def check_risk_limits(self, position_risk: PositionRisk, 
                         portfolio_value: float) -> List[RiskAlert]:
        """Check all risk limits and generate alerts"""
        
        alerts = []
        
        # Position size limit
        position_weight = position_risk.market_value / portfolio_value if portfolio_value > 0 else 0
        if position_weight > self.concentration_limit:
            alerts.append(RiskAlert(
                alert_type=AlertType.CONCENTRATION,
                level=RiskLevel.HIGH,
                message=f"Position concentration {position_weight:.2%} exceeds limit {self.concentration_limit:.2%}",
                value=position_weight,
                threshold=self.concentration_limit,
                action_required=True
            ))
        
        # Drawdown limit
        if position_risk.max_drawdown > self.max_drawdown:
            alerts.append(RiskAlert(
                alert_type=AlertType.DRAWDOWN,
                level=RiskLevel.CRITICAL,
                message=f"Drawdown {position_risk.max_drawdown:.2%} exceeds limit {self.max_drawdown:.2%}",
                value=position_risk.max_drawdown,
                threshold=self.max_drawdown,
                action_required=True
            ))
        
        # VaR limit
        portfolio_var = position_risk.var_1d / portfolio_value if portfolio_value > 0 else 0
        if portfolio_var > self.max_portfolio_var:
            alerts.append(RiskAlert(
                alert_type=AlertType.VAR_BREACH,
                level=RiskLevel.HIGH,
                message=f"Portfolio VaR {portfolio_var:.2%} exceeds limit {self.max_portfolio_var:.2%}",
                value=portfolio_var,
                threshold=self.max_portfolio_var,
                action_required=True
            ))
        
        # Volatility warning
        if position_risk.volatility > 0.5:  # 50% annual volatility
            alerts.append(RiskAlert(
                alert_type=AlertType.VOLATILITY,
                level=RiskLevel.MEDIUM,
                message=f"High volatility detected: {position_risk.volatility:.2%}",
                value=position_risk.volatility,
                threshold=0.5,
                action_required=False
            ))
        
        return alerts
    
    def calculate_optimal_position_size(self, signal_strength: float,
                                      current_price: float,
                                      returns_history: np.ndarray,
                                      portfolio_value: float,
                                      trade_history: List[Dict]) -> float:
        """Calculate optimal position size using multiple methods"""
        
        if len(trade_history) < 10:
            # Conservative sizing for new strategy
            base_size = signal_strength * 0.02  # 2% max
        else:
            # Calculate win rate and average returns
            wins = [t for t in trade_history if t.get('pnl', 0) > 0]
            losses = [t for t in trade_history if t.get('pnl', 0) < 0]
            
            win_rate = len(wins) / len(trade_history)
            avg_win = np.mean([t['pnl'] for t in wins]) if wins else 0
            avg_loss = np.mean([abs(t['pnl']) for t in losses]) if losses else 0
            
            # Kelly criterion
            kelly_size = self.position_sizer.kelly_criterion(win_rate, avg_win, avg_loss)
            
            # Volatility targeting
            target_vol = 0.15  # 15% target volatility
            current_vol = self.risk_metrics.calculate_volatility(returns_history)
            vol_size = self.position_sizer.volatility_targeting(
                target_vol, current_vol, kelly_size
            )
            
            # VaR-based sizing
            var = self.risk_metrics.calculate_var(returns_history)
            var_size = self.position_sizer.var_based_sizing(
                var, self.max_portfolio_var, 0  # Simplified
            )
            
            # Take conservative average
            base_size = np.mean([kelly_size, vol_size, var_size])
        
        # Apply signal strength
        position_size = base_size * abs(signal_strength)
        
        # Apply sign
        if signal_strength < 0:
            position_size = -position_size
        
        # Apply hard limits
        position_size = np.clip(position_size, -self.max_position_size, self.max_position_size)
        
        return position_size
    
    def should_halt_trading(self, current_pnl: float, consecutive_losses: int) -> bool:
        """Determine if trading should be halted"""
        
        # Daily loss limit
        if abs(current_pnl) > self.max_daily_loss:
            logger.warning(f"Daily loss limit breached: {current_pnl:.4f}")
            return True
        
        # Consecutive losses
        if consecutive_losses >= config.risk.consecutive_loss_limit:
            logger.warning(f"Consecutive loss limit breached: {consecutive_losses}")
            return True
        
        return False
    
    def update_risk_state(self, trade_result: Dict, portfolio_value: float):
        """Update risk tracking state"""
        
        pnl = trade_result.get('pnl', 0)
        
        # Update consecutive losses
        if pnl < 0:
            self.consecutive_losses += 1
        else:
            self.consecutive_losses = 0
        
        # Update daily loss
        self.daily_loss += pnl
        
        # Check for trading halt
        if self.should_halt_trading(self.daily_loss, self.consecutive_losses):
            self.trading_halted = True
            self.halt_start_time = datetime.now()
            
            self.risk_alerts.append(RiskAlert(
                alert_type=AlertType.LOSS_STREAK,
                level=RiskLevel.CRITICAL,
                message="Trading halted due to risk limits",
                value=self.consecutive_losses,
                threshold=config.risk.consecutive_loss_limit,
                action_required=True
            ))
        
        # Store risk metrics
        self.risk_metrics_history.append({
            'timestamp': datetime.now(),
            'portfolio_value': portfolio_value,
            'daily_pnl': self.daily_loss,
            'consecutive_losses': self.consecutive_losses,
            'trading_halted': self.trading_halted
        })
    
    def should_resume_trading(self) -> bool:
        """Check if trading can be resumed after halt"""
        
        if not self.trading_halted:
            return True
        
        # Resume after cooldown period (e.g., 1 hour)
        if self.halt_start_time and datetime.now() - self.halt_start_time > timedelta(hours=1):
            self.trading_halted = False
            self.halt_start_time = None
            self.daily_loss = 0  # Reset daily loss
            logger.info("Trading resumed after cooldown period")
            return True
        
        return False
    
    def generate_risk_report(self) -> Dict[str, Any]:
        """Generate comprehensive risk report"""
        
        if not self.risk_metrics_history:
            return {"error": "No risk data available"}
        
        recent_metrics = self.risk_metrics_history[-100:]  # Last 100 records
        
        # Portfolio statistics
        portfolio_values = [m['portfolio_value'] for m in recent_metrics]
        daily_pnls = [m['daily_pnl'] for m in recent_metrics]
        
        if len(portfolio_values) > 1:
            returns = np.diff(portfolio_values) / portfolio_values[:-1]
            volatility = self.risk_metrics.calculate_volatility(returns)
            sharpe = self.risk_metrics.calculate_sharpe_ratio(returns)
            max_dd, _, dd_duration = self.risk_metrics.calculate_maximum_drawdown(np.array(portfolio_values))
            var_95 = self.risk_metrics.calculate_var(returns, 0.95)
            var_99 = self.risk_metrics.calculate_var(returns, 0.99)
        else:
            volatility = sharpe = max_dd = dd_duration = var_95 = var_99 = 0
        
        # Risk alerts summary
        recent_alerts = [a for a in self.risk_alerts if a.timestamp > datetime.now() - timedelta(days=1)]
        alert_counts = {level.name: 0 for level in RiskLevel}
        for alert in recent_alerts:
            alert_counts[alert.level.name] += 1
        
        report = {
            'portfolio_metrics': {
                'current_value': portfolio_values[-1] if portfolio_values else 0,
                'volatility': volatility,
                'sharpe_ratio': sharpe,
                'max_drawdown': max_dd,
                'drawdown_duration': dd_duration,
                'var_95': var_95,
                'var_99': var_99
            },
            'risk_limits': {
                'daily_loss': self.daily_loss,
                'consecutive_losses': self.consecutive_losses,
                'trading_halted': self.trading_halted
            },
            'alerts': {
                'total_alerts_24h': len(recent_alerts),
                'alert_counts': alert_counts,
                'critical_alerts': [a.message for a in recent_alerts if a.level == RiskLevel.CRITICAL]
            },
            'recommendations': self._generate_recommendations()
        }
        
        return report
    
    def _generate_recommendations(self) -> List[str]:
        """Generate risk management recommendations"""
        
        recommendations = []
        
        if self.consecutive_losses >= 3:
            recommendations.append("Consider reducing position sizes due to losing streak")
        
        if self.daily_loss < -0.02:  # 2% daily loss
            recommendations.append("Daily loss approaching limit - consider defensive strategies")
        
        if len([a for a in self.risk_alerts if a.level == RiskLevel.CRITICAL]) > 0:
            recommendations.append("Critical risk alerts active - review and address immediately")
        
        if self.trading_halted:
            recommendations.append("Trading currently halted - wait for conditions to improve")
        
        if not recommendations:
            recommendations.append("Risk metrics within acceptable ranges")
        
        return recommendations

# Risk management decorators and utilities

def risk_managed(risk_manager: RiskManager):
    """Decorator to add risk management to trading functions"""
    
    def decorator(func):
        def wrapper(*args, **kwargs):
            # Check if trading is halted
            if not risk_manager.should_resume_trading():
                return None  # Skip trade
            
            # Execute original function
            result = func(*args, **kwargs)
            
            # Update risk state if trade was executed
            if result and isinstance(result, dict):
                risk_manager.update_risk_state(result, result.get('portfolio_value', 0))
            
            return result
        return wrapper
    return decorator

class RiskAwareEnvironment:
    """Environment wrapper that integrates risk management"""
    
    def __init__(self, base_env: 'TradingEnvironment'):
        self.base_env = base_env
        self.risk_manager = RiskManager()
        
    def step(self, action):
        """Risk-aware step function"""
        
        # Check if trading should be halted
        if not self.risk_manager.should_resume_trading():
            # Return neutral action
            action = np.array([0.0, 0.0, 0.0])
        
        # Execute step
        obs, reward, terminated, truncated, info = self.base_env.step(action)
        
        # Evaluate risks
        if hasattr(self.base_env, 'position') and self.base_env.position.size != 0:
            # Calculate position risk (simplified)
            returns_history = np.array([0.01])  # Placeholder
            position_risk = self.risk_manager.evaluate_position_risk(
                self.base_env.position.size,
                self.base_env.position.entry_price,
                info['current_price'],
                returns_history
            )
            
            # Check limits
            alerts = self.risk_manager.check_risk_limits(
                position_risk, 
                info['total_value']
            )
            
            # Add alerts to info
            info['risk_alerts'] = [alert.message for alert in alerts]
            info['risk_metrics'] = {
                'var_1d': position_risk.var_1d,
                'volatility': position_risk.volatility,
                'max_drawdown': position_risk.max_drawdown
            }
        
        return obs, reward, terminated, truncated, info

if __name__ == "__main__":
    # Example usage
    risk_manager = RiskManager()
    
    # Simulate some trading data
    returns = np.random.normal(0.001, 0.02, 100)  # Daily returns
    portfolio_values = np.cumprod(1 + returns) * 100000
    
    # Evaluate position risk
    position_risk = risk_manager.evaluate_position_risk(
        position_size=0.1,
        entry_price=1000,
        current_price=1050,
        returns_history=returns
    )
    
    print(f"Position VaR (95%): ${position_risk.var_1d:.2f}")
    print(f"Position volatility: {position_risk.volatility:.2%}")
    print(f"Sharpe ratio: {position_risk.sharpe_ratio:.3f}")
    
    # Check risk limits
    alerts = risk_manager.check_risk_limits(position_risk, portfolio_values[-1])
    
    for alert in alerts:
        print(f"Risk Alert [{alert.level.name}]: {alert.message}")
    
    # Generate risk report
    risk_report = risk_manager.generate_risk_report()
    print(f"\nRisk Report: {risk_report}")
