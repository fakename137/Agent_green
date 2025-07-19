"""
Comprehensive backtesting and evaluation framework
"""
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from typing import Dict, List, Tuple, Optional, Any, Union
import logging
from datetime import datetime, timedelta
from pathlib import Path
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import plotly.express as px
from dataclasses import dataclass
from scipy import stats
import warnings
from config import config
from trading_environment import TradingEnvironment
from ppo_agent import PPOAgent
from risk_manager import RiskManager

logging.basicConfig(level=getattr(logging, config.log_level))
logger = logging.getLogger(__name__)

@dataclass
class BacktestResults:
    """Container for backtest results"""
    # Performance metrics
    total_return: float
    annualized_return: float
    volatility: float
    sharpe_ratio: float
    sortino_ratio: float
    calmar_ratio: float
    
    # Risk metrics
    max_drawdown: float
    max_drawdown_duration: int
    var_95: float
    var_99: float
    
    # Trading metrics
    total_trades: int
    win_rate: float
    profit_factor: float
    avg_win: float
    avg_loss: float
    largest_win: float
    largest_loss: float
    
    # Time series data
    equity_curve: pd.Series
    returns: pd.Series
    trades: pd.DataFrame
    positions: pd.DataFrame
    
    # Additional metrics
    benchmark_return: float
    alpha: float
    beta: float
    information_ratio: float
    tracking_error: float

class PerformanceAnalyzer:
    """Analyzes trading performance and generates metrics"""
    
    def __init__(self):
        self.risk_free_rate = config.backtest.risk_free_rate
    
    def calculate_returns_metrics(self, returns: pd.Series) -> Dict[str, float]:
        """Calculate return-based performance metrics"""
        
        if len(returns) < 2:
            return self._empty_metrics()
        
        # Basic return metrics
        total_return = (1 + returns).prod() - 1
        periods_per_year = self._get_periods_per_year(returns)
        annualized_return = (1 + total_return) ** (periods_per_year / len(returns)) - 1
        
        # Volatility
        volatility = returns.std() * np.sqrt(periods_per_year)
        
        # Sharpe ratio
        excess_returns = returns - self.risk_free_rate / periods_per_year
        sharpe_ratio = excess_returns.mean() / returns.std() * np.sqrt(periods_per_year) if returns.std() != 0 else 0
        
        # Sortino ratio (downside deviation)
        downside_returns = returns[returns < 0]
        downside_deviation = downside_returns.std() if len(downside_returns) > 0 else returns.std()
        sortino_ratio = excess_returns.mean() / downside_deviation * np.sqrt(periods_per_year) if downside_deviation != 0 else 0
        
        return {
            'total_return': total_return,
            'annualized_return': annualized_return,
            'volatility': volatility,
            'sharpe_ratio': sharpe_ratio,
            'sortino_ratio': sortino_ratio
        }
    
    def calculate_drawdown_metrics(self, equity_curve: pd.Series) -> Dict[str, float]:
        """Calculate drawdown-related metrics"""
        
        if len(equity_curve) < 2:
            return {'max_drawdown': 0, 'max_drawdown_duration': 0, 'calmar_ratio': 0}
        
        # Calculate drawdown
        running_max = equity_curve.expanding().max()
        drawdown = (equity_curve - running_max) / running_max
        
        # Maximum drawdown
        max_drawdown = abs(drawdown.min())
        
        # Drawdown duration
        drawdown_periods = (drawdown < 0).astype(int)
        drawdown_duration = self._calculate_max_consecutive(drawdown_periods)
        
        # Calmar ratio
        returns_metrics = self.calculate_returns_metrics(equity_curve.pct_change().dropna())
        calmar_ratio = returns_metrics['annualized_return'] / max_drawdown if max_drawdown != 0 else 0
        
        return {
            'max_drawdown': max_drawdown,
            'max_drawdown_duration': drawdown_duration,
            'calmar_ratio': calmar_ratio
        }
    
    def calculate_var_metrics(self, returns: pd.Series) -> Dict[str, float]:
        """Calculate Value at Risk metrics"""
        
        if len(returns) < 30:
            return {'var_95': 0, 'var_99': 0}
        
        var_95 = -np.percentile(returns, 5)
        var_99 = -np.percentile(returns, 1)
        
        return {
            'var_95': var_95,
            'var_99': var_99
        }
    
    def calculate_trading_metrics(self, trades: pd.DataFrame) -> Dict[str, float]:
        """Calculate trading-specific metrics"""
        
        if len(trades) == 0:
            return self._empty_trading_metrics()
        
        # Basic trading stats
        total_trades = len(trades)
        winning_trades = trades[trades['pnl'] > 0]
        losing_trades = trades[trades['pnl'] < 0]
        
        win_rate = len(winning_trades) / total_trades if total_trades > 0 else 0
        
        # Profit metrics
        total_profit = winning_trades['pnl'].sum() if len(winning_trades) > 0 else 0
        total_loss = abs(losing_trades['pnl'].sum()) if len(losing_trades) > 0 else 0
        profit_factor = total_profit / total_loss if total_loss > 0 else float('inf')
        
        # Average trade metrics
        avg_win = winning_trades['pnl'].mean() if len(winning_trades) > 0 else 0
        avg_loss = losing_trades['pnl'].mean() if len(losing_trades) > 0 else 0
        
        # Extreme trades
        largest_win = trades['pnl'].max() if len(trades) > 0 else 0
        largest_loss = trades['pnl'].min() if len(trades) > 0 else 0
        
        return {
            'total_trades': total_trades,
            'win_rate': win_rate,
            'profit_factor': profit_factor,
            'avg_win': avg_win,
            'avg_loss': avg_loss,
            'largest_win': largest_win,
            'largest_loss': largest_loss
        }
    
    def calculate_benchmark_metrics(self, returns: pd.Series, 
                                  benchmark_returns: pd.Series) -> Dict[str, float]:
        """Calculate benchmark-relative metrics"""
        
        if len(returns) != len(benchmark_returns) or len(returns) < 2:
            return {'benchmark_return': 0, 'alpha': 0, 'beta': 0, 'information_ratio': 0, 'tracking_error': 0}
        
        # Align series
        aligned_returns = returns.align(benchmark_returns, join='inner')
        returns_aligned, benchmark_aligned = aligned_returns[0], aligned_returns[1]
        
        if len(returns_aligned) < 2:
            return {'benchmark_return': 0, 'alpha': 0, 'beta': 0, 'information_ratio': 0, 'tracking_error': 0}
        
        # Benchmark return
        benchmark_return = (1 + benchmark_aligned).prod() - 1
        
        # Beta and Alpha (CAPM)
        covariance = np.cov(returns_aligned, benchmark_aligned)[0, 1]
        benchmark_variance = np.var(benchmark_aligned)
        beta = covariance / benchmark_variance if benchmark_variance != 0 else 1
        
        returns_metrics = self.calculate_returns_metrics(returns_aligned)
        benchmark_metrics = self.calculate_returns_metrics(benchmark_aligned)
        
        alpha = returns_metrics['annualized_return'] - (self.risk_free_rate + beta * (benchmark_metrics['annualized_return'] - self.risk_free_rate))
        
        # Information ratio and tracking error
        excess_returns = returns_aligned - benchmark_aligned
        tracking_error = excess_returns.std() * np.sqrt(self._get_periods_per_year(returns_aligned))
        information_ratio = excess_returns.mean() / excess_returns.std() * np.sqrt(self._get_periods_per_year(returns_aligned)) if excess_returns.std() != 0 else 0
        
        return {
            'benchmark_return': benchmark_return,
            'alpha': alpha,
            'beta': beta,
            'information_ratio': information_ratio,
            'tracking_error': tracking_error
        }
    
    def _get_periods_per_year(self, series: pd.Series) -> int:
        """Estimate periods per year from series frequency"""
        
        if len(series) < 2:
            return 252  # Default to daily
        
        # Calculate average time difference
        time_diff = pd.Series(series.index).diff().dt.total_seconds().median()
        
        if time_diff <= 60:  # 1 minute or less
            return 365 * 24 * 60
        elif time_diff <= 300:  # 5 minutes
            return 365 * 24 * 12
        elif time_diff <= 3600:  # 1 hour
            return 365 * 24
        elif time_diff <= 86400:  # 1 day
            return 365
        else:
            return 252  # Default to business days
    
    def _calculate_max_consecutive(self, binary_series: pd.Series) -> int:
        """Calculate maximum consecutive True values"""
        
        groups = (binary_series != binary_series.shift()).cumsum()
        consecutive_counts = binary_series.groupby(groups).sum()
        return consecutive_counts.max() if len(consecutive_counts) > 0 else 0
    
    def _empty_metrics(self) -> Dict[str, float]:
        """Return empty metrics dictionary"""
        return {
            'total_return': 0,
            'annualized_return': 0,
            'volatility': 0,
            'sharpe_ratio': 0,
            'sortino_ratio': 0
        }
    
    def _empty_trading_metrics(self) -> Dict[str, float]:
        """Return empty trading metrics dictionary"""
        return {
            'total_trades': 0,
            'win_rate': 0,
            'profit_factor': 0,
            'avg_win': 0,
            'avg_loss': 0,
            'largest_win': 0,
            'largest_loss': 0
        }

class Backtester:
    """Main backtesting engine"""
    
    def __init__(self, data: pd.DataFrame, agent: PPOAgent = None):
        self.data = data
        self.agent = agent
        self.analyzer = PerformanceAnalyzer()
        self.risk_manager = RiskManager()
        
        # Results storage
        self.results: Optional[BacktestResults] = None
        self.detailed_results: Dict[str, Any] = {}
        
    def run_backtest(self, start_date: str = None, end_date: str = None,
                    initial_balance: float = None, benchmark: str = "buy_hold") -> BacktestResults:
        """Run complete backtest"""
        
        logger.info("Starting backtest...")
        
        # Set parameters
        if initial_balance is None:
            initial_balance = config.environment.initial_balance
        
        # Filter data by date range
        backtest_data = self._filter_data_by_date(start_date, end_date)
        
        if len(backtest_data) < 100:
            raise ValueError("Insufficient data for backtesting")
        
        # Create environment
        env = TradingEnvironment(backtest_data)
        
        # Initialize tracking
        equity_curve = []
        returns_list = []
        trades_list = []
        positions_list = []
        
        # Run simulation
        obs, info = env.reset()
        episode_count = 0
        total_steps = 0
        
        while total_steps < len(backtest_data) - config.environment.episode_length:
            episode_count += 1
            episode_trades = []
            episode_positions = []
            
            # Run episode
            for step in range(config.environment.episode_length):
                total_steps += 1
                
                if self.agent:
                    # Use trained agent
                    action, _, _ = self.agent.get_action(obs, deterministic=True)
                else:
                    # Random baseline
                    action = env.action_space.sample()
                
                obs, reward, terminated, truncated, info = env.step(action)
                
                # Record state
                equity_curve.append(info['total_value'])
                if len(equity_curve) > 1:
                    returns_list.append((info['total_value'] - equity_curve[-2]) / equity_curve[-2])
                
                # Record trades
                if len(env.trade_history) > len(trades_list):
                    new_trades = env.trade_history[len(trades_list):]
                    for trade in new_trades:
                        trades_list.append({
                            'timestamp': backtest_data.index[total_steps],
                            'action': trade.action,
                            'size': trade.size,
                            'price': trade.price,
                            'pnl': trade.pnl,
                            'fees': trade.fees
                        })
                
                # Record positions
                positions_list.append({
                    'timestamp': backtest_data.index[total_steps],
                    'position_size': info['position_size'],
                    'unrealized_pnl': info['unrealized_pnl'],
                    'total_value': info['total_value']
                })
                
                if terminated or truncated:
                    break
            
            # Reset for next episode
            if total_steps < len(backtest_data) - config.environment.episode_length:
                obs, info = env.reset(options={'start_idx': total_steps})
        
        # Create time series
        equity_series = pd.Series(equity_curve, index=backtest_data.index[:len(equity_curve)])
        returns_series = pd.Series(returns_list, index=backtest_data.index[1:len(returns_list)+1])
        trades_df = pd.DataFrame(trades_list)
        positions_df = pd.DataFrame(positions_list)
        
        # Calculate benchmark
        benchmark_returns = self._calculate_benchmark_returns(backtest_data, benchmark)
        
        # Calculate all metrics
        results = self._compile_results(
            equity_series, returns_series, trades_df, positions_df, benchmark_returns
        )
        
        self.results = results
        
        logger.info(f"Backtest completed. Total return: {results.total_return:.2%}")
        
        return results
    
    def _filter_data_by_date(self, start_date: str = None, end_date: str = None) -> pd.DataFrame:
        """Filter data by date range"""
        
        data = self.data.copy()
        
        if start_date:
            data = data[data.index >= start_date]
        
        if end_date:
            data = data[data.index <= end_date]
        
        return data
    
    def _calculate_benchmark_returns(self, data: pd.DataFrame, benchmark: str) -> pd.Series:
        """Calculate benchmark returns"""
        
        if benchmark == "buy_hold":
            # Buy and hold strategy
            prices = data['close']
            benchmark_returns = prices.pct_change().dropna()
        elif benchmark == "zero":
            # Zero returns (cash)
            benchmark_returns = pd.Series(0, index=data.index)
        else:
            # Default to buy and hold
            prices = data['close']
            benchmark_returns = prices.pct_change().dropna()
        
        return benchmark_returns
    
    def _compile_results(self, equity_curve: pd.Series, returns: pd.Series,
                        trades: pd.DataFrame, positions: pd.DataFrame,
                        benchmark_returns: pd.Series) -> BacktestResults:
        """Compile all results into BacktestResults object"""
        
        # Calculate metrics
        returns_metrics = self.analyzer.calculate_returns_metrics(returns)
        drawdown_metrics = self.analyzer.calculate_drawdown_metrics(equity_curve)
        var_metrics = self.analyzer.calculate_var_metrics(returns)
        trading_metrics = self.analyzer.calculate_trading_metrics(trades)
        benchmark_metrics = self.analyzer.calculate_benchmark_metrics(returns, benchmark_returns)
        
        return BacktestResults(
            # Performance metrics
            total_return=returns_metrics['total_return'],
            annualized_return=returns_metrics['annualized_return'],
            volatility=returns_metrics['volatility'],
            sharpe_ratio=returns_metrics['sharpe_ratio'],
            sortino_ratio=returns_metrics['sortino_ratio'],
            calmar_ratio=drawdown_metrics['calmar_ratio'],
            
            # Risk metrics
            max_drawdown=drawdown_metrics['max_drawdown'],
            max_drawdown_duration=drawdown_metrics['max_drawdown_duration'],
            var_95=var_metrics['var_95'],
            var_99=var_metrics['var_99'],
            
            # Trading metrics
            total_trades=trading_metrics['total_trades'],
            win_rate=trading_metrics['win_rate'],
            profit_factor=trading_metrics['profit_factor'],
            avg_win=trading_metrics['avg_win'],
            avg_loss=trading_metrics['avg_loss'],
            largest_win=trading_metrics['largest_win'],
            largest_loss=trading_metrics['largest_loss'],
            
            # Time series data
            equity_curve=equity_curve,
            returns=returns,
            trades=trades,
            positions=positions,
            
            # Benchmark metrics
            benchmark_return=benchmark_metrics['benchmark_return'],
            alpha=benchmark_metrics['alpha'],
            beta=benchmark_metrics['beta'],
            information_ratio=benchmark_metrics['information_ratio'],
            tracking_error=benchmark_metrics['tracking_error']
        )

class BacktestVisualizer:
    """Creates visualizations for backtest results"""
    
    def __init__(self, results: BacktestResults):
        self.results = results
        
    def create_equity_curve_plot(self) -> go.Figure:
        """Create interactive equity curve plot"""
        
        fig = go.Figure()
        
        # Add equity curve
        fig.add_trace(go.Scatter(
            x=self.results.equity_curve.index,
            y=self.results.equity_curve.values,
            mode='lines',
            name='Portfolio Value',
            line=dict(color='blue', width=2)
        ))
        
        # Add benchmark (buy and hold)
        if hasattr(self.results, 'benchmark_equity'):
            fig.add_trace(go.Scatter(
                x=self.results.benchmark_equity.index,
                y=self.results.benchmark_equity.values,
                mode='lines',
                name='Buy & Hold',
                line=dict(color='gray', width=1, dash='dash')
            ))
        
        # Add drawdown
        running_max = self.results.equity_curve.expanding().max()
        drawdown = (self.results.equity_curve - running_max) / running_max
        
        fig.add_trace(go.Scatter(
            x=drawdown.index,
            y=drawdown.values,
            mode='lines',
            name='Drawdown',
            yaxis='y2',
            line=dict(color='red', width=1),
            fill='tonexty',
            fillcolor='rgba(255,0,0,0.1)'
        ))
        
        # Layout
        fig.update_layout(
            title='Portfolio Equity Curve and Drawdown',
            xaxis_title='Date',
            yaxis=dict(title='Portfolio Value ($)', side='left'),
            yaxis2=dict(title='Drawdown (%)', side='right', overlaying='y', tickformat='.1%'),
            hovermode='x unified',
            height=600
        )
        
        return fig
    
    def create_returns_distribution_plot(self) -> go.Figure:
        """Create returns distribution plot"""
        
        fig = make_subplots(
            rows=2, cols=2,
            subplot_titles=('Returns Distribution', 'Returns Over Time', 'Rolling Sharpe Ratio', 'Rolling Volatility'),
            specs=[[{"secondary_y": False}, {"secondary_y": False}],
                   [{"secondary_y": False}, {"secondary_y": False}]]
        )
        
        returns = self.results.returns.dropna()
        
        # Returns histogram
        fig.add_trace(
            go.Histogram(x=returns.values, nbinsx=50, name='Returns'),
            row=1, col=1
        )
        
        # Returns over time
        fig.add_trace(
            go.Scatter(x=returns.index, y=returns.values, mode='lines', name='Daily Returns'),
            row=1, col=2
        )
        
        # Rolling Sharpe ratio
        rolling_sharpe = returns.rolling(30).mean() / returns.rolling(30).std() * np.sqrt(252)
        fig.add_trace(
            go.Scatter(x=rolling_sharpe.index, y=rolling_sharpe.values, mode='lines', name='30-Day Sharpe'),
            row=2, col=1
        )
        
        # Rolling volatility
        rolling_vol = returns.rolling(30).std() * np.sqrt(252)
        fig.add_trace(
            go.Scatter(x=rolling_vol.index, y=rolling_vol.values, mode='lines', name='30-Day Volatility'),
            row=2, col=2
        )
        
        fig.update_layout(height=800, title_text="Returns Analysis")
        
        return fig
    
    def create_trading_analysis_plot(self) -> go.Figure:
        """Create trading analysis visualization"""
        
        if len(self.results.trades) == 0:
            return go.Figure().add_annotation(text="No trades to display", showarrow=False)
        
        fig = make_subplots(
            rows=2, cols=2,
            subplot_titles=('Trade PnL Distribution', 'Cumulative Trade PnL', 'Trade Sizes', 'Win/Loss Streaks')
        )
        
        trades = self.results.trades
        
        # Trade PnL distribution
        fig.add_trace(
            go.Histogram(x=trades['pnl'], nbinsx=30, name='Trade PnL'),
            row=1, col=1
        )
        
        # Cumulative trade PnL
        cum_pnl = trades['pnl'].cumsum()
        fig.add_trace(
            go.Scatter(x=cum_pnl.index, y=cum_pnl.values, mode='lines', name='Cumulative PnL'),
            row=1, col=2
        )
        
        # Trade sizes
        fig.add_trace(
            go.Scatter(x=trades.index, y=trades['size'], mode='markers', name='Trade Size'),
            row=2, col=1
        )
        
        # Win/Loss analysis
        trades['win'] = (trades['pnl'] > 0).astype(int)
        trades['streak'] = trades['win'].groupby((trades['win'] != trades['win'].shift()).cumsum()).cumsum()
        
        fig.add_trace(
            go.Scatter(x=trades.index, y=trades['streak'], mode='lines', name='Win Streak'),
            row=2, col=2
        )
        
        fig.update_layout(height=800, title_text="Trading Analysis")
        
        return fig
    
    def create_risk_metrics_plot(self) -> go.Figure:
        """Create risk metrics visualization"""
        
        fig = make_subplots(
            rows=2, cols=2,
            subplot_titles=('Rolling VaR', 'Drawdown Periods', 'Return vs Risk', 'Position Exposure')
        )
        
        returns = self.results.returns.dropna()
        
        # Rolling VaR
        rolling_var = returns.rolling(60).quantile(0.05) * -1
        fig.add_trace(
            go.Scatter(x=rolling_var.index, y=rolling_var.values, mode='lines', name='60-Day VaR (95%)'),
            row=1, col=1
        )
        
        # Drawdown periods
        running_max = self.results.equity_curve.expanding().max()
        drawdown = (self.results.equity_curve - running_max) / running_max
        fig.add_trace(
            go.Scatter(x=drawdown.index, y=drawdown.values, mode='lines', name='Drawdown', fill='tonexty'),
            row=1, col=2
        )
        
        # Return vs Risk scatter
        monthly_returns = returns.resample('M').apply(lambda x: (1 + x).prod() - 1)
        monthly_vol = returns.resample('M').std() * np.sqrt(252)
        
        fig.add_trace(
            go.Scatter(x=monthly_vol, y=monthly_returns, mode='markers', name='Monthly Return vs Vol'),
            row=2, col=1
        )
        
        # Position exposure
        if len(self.results.positions) > 0:
            positions = self.results.positions
            fig.add_trace(
                go.Scatter(x=positions['timestamp'], y=positions['position_size'], 
                          mode='lines', name='Position Size'),
                row=2, col=2
            )
        
        fig.update_layout(height=800, title_text="Risk Analysis")
        
        return fig
    
    def generate_report_html(self, output_path: str = None) -> str:
        """Generate comprehensive HTML report"""
        
        if output_path is None:
            output_path = f"backtest_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.html"
        
        # Create all plots
        equity_fig = self.create_equity_curve_plot()
        returns_fig = self.create_returns_distribution_plot()
        trading_fig = self.create_trading_analysis_plot()
        risk_fig = self.create_risk_metrics_plot()
        
        # Generate HTML report
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Backtest Report</title>
            <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
            <style>
                body {{ font-family: Arial, sans-serif; margin: 20px; }}
                .metric {{ display: inline-block; margin: 10px; padding: 10px; border: 1px solid #ccc; }}
                .section {{ margin: 30px 0; }}
            </style>
        </head>
        <body>
            <h1>Trading Strategy Backtest Report</h1>
            
            <div class="section">
                <h2>Performance Summary</h2>
                <div class="metric"><strong>Total Return:</strong> {self.results.total_return:.2%}</div>
                <div class="metric"><strong>Annualized Return:</strong> {self.results.annualized_return:.2%}</div>
                <div class="metric"><strong>Volatility:</strong> {self.results.volatility:.2%}</div>
                <div class="metric"><strong>Sharpe Ratio:</strong> {self.results.sharpe_ratio:.3f}</div>
                <div class="metric"><strong>Max Drawdown:</strong> {self.results.max_drawdown:.2%}</div>
                <div class="metric"><strong>Win Rate:</strong> {self.results.win_rate:.2%}</div>
                <div class="metric"><strong>Total Trades:</strong> {self.results.total_trades}</div>
            </div>
            
            <div class="section">
                <h2>Equity Curve</h2>
                <div id="equity_plot"></div>
            </div>
            
            <div class="section">
                <h2>Returns Analysis</h2>
                <div id="returns_plot"></div>
            </div>
            
            <div class="section">
                <h2>Trading Analysis</h2>
                <div id="trading_plot"></div>
            </div>
            
            <div class="section">
                <h2>Risk Analysis</h2>
                <div id="risk_plot"></div>
            </div>
            
            <script>
                Plotly.newPlot('equity_plot', {equity_fig.to_json()});
                Plotly.newPlot('returns_plot', {returns_fig.to_json()});
                Plotly.newPlot('trading_plot', {trading_fig.to_json()});
                Plotly.newPlot('risk_plot', {risk_fig.to_json()});
            </script>
        </body>
        </html>
        """
        
        # Save HTML file
        with open(output_path, 'w') as f:
            f.write(html_content)
        
        logger.info(f"Report saved to {output_path}")
        
        return output_path

class MonteCarloBacktester:
    """Monte Carlo simulation for backtesting"""
    
    def __init__(self, base_backtester: Backtester):
        self.base_backtester = base_backtester
        
    def run_monte_carlo(self, n_simulations: int = 1000) -> Dict[str, Any]:
        """Run Monte Carlo simulation"""
        
        logger.info(f"Running Monte Carlo simulation with {n_simulations} iterations...")
        
        results = []
        
        for i in range(n_simulations):
            if i % 100 == 0:
                logger.info(f"Simulation {i}/{n_simulations}")
            
            # Shuffle returns while preserving autocorrelation structure
            shuffled_data = self._shuffle_data()
            
            # Run backtest with shuffled data
            temp_backtester = Backtester(shuffled_data, self.base_backtester.agent)
            result = temp_backtester.run_backtest()
            
            results.append({
                'total_return': result.total_return,
                'sharpe_ratio': result.sharpe_ratio,
                'max_drawdown': result.max_drawdown,
                'win_rate': result.win_rate
            })
        
        # Analyze results
        results_df = pd.DataFrame(results)
        
        analysis = {
            'simulations': n_simulations,
            'metrics_distribution': {
                'total_return': {
                    'mean': results_df['total_return'].mean(),
                    'std': results_df['total_return'].std(),
                    'percentiles': results_df['total_return'].quantile([0.05, 0.25, 0.5, 0.75, 0.95]).to_dict()
                },
                'sharpe_ratio': {
                    'mean': results_df['sharpe_ratio'].mean(),
                    'std': results_df['sharpe_ratio'].std(),
                    'percentiles': results_df['sharpe_ratio'].quantile([0.05, 0.25, 0.5, 0.75, 0.95]).to_dict()
                },
                'max_drawdown': {
                    'mean': results_df['max_drawdown'].mean(),
                    'std': results_df['max_drawdown'].std(),
                    'percentiles': results_df['max_drawdown'].quantile([0.05, 0.25, 0.5, 0.75, 0.95]).to_dict()
                }
            },
            'confidence_intervals': {
                'total_return_95': (
                    results_df['total_return'].quantile(0.025),
                    results_df['total_return'].quantile(0.975)
                ),
                'sharpe_ratio_95': (
                    results_df['sharpe_ratio'].quantile(0.025),
                    results_df['sharpe_ratio'].quantile(0.975)
                )
            },
            'risk_metrics': {
                'probability_of_loss': (results_df['total_return'] < 0).mean(),
                'probability_of_large_drawdown': (results_df['max_drawdown'] > 0.2).mean(),
                'expected_worst_case': results_df['total_return'].quantile(0.05)
            }
        }
        
        logger.info("Monte Carlo simulation completed")
        
        return analysis
    
    def _shuffle_data(self) -> pd.DataFrame:
        """Shuffle data while preserving structure"""
        
        data = self.base_backtester.data.copy()
        
        # Simple approach: shuffle returns while keeping prices structure
        returns = data['close'].pct_change().dropna()
        shuffled_returns = returns.sample(frac=1, random_state=np.random.randint(0, 10000)).values
        
        # Reconstruct prices
        new_prices = [data['close'].iloc[0]]
        for ret in shuffled_returns:
            new_prices.append(new_prices[-1] * (1 + ret))
        
        # Update OHLC (simplified)
        data.loc[data.index[1:], 'close'] = new_prices[1:]
        data.loc[data.index[1:], 'open'] = data['close'].shift(1).iloc[1:]
        data.loc[data.index[1:], 'high'] = data[['open', 'close']].max(axis=1).iloc[1:] * (1 + np.random.uniform(0, 0.01, len(data)-1))
        data.loc[data.index[1:], 'low'] = data[['open', 'close']].min(axis=1).iloc[1:] * (1 - np.random.uniform(0, 0.01, len(data)-1))
        
        return data

if __name__ == "__main__":
    # Example usage
    from data_collector import DataCollector
    import asyncio
    
    # Collect data
    collector = DataCollector()
    data = asyncio.run(collector.collect_data())
    
    # Create and train agent (simplified)
    env = TradingEnvironment(data)
    agent = PPOAgent(env.observation_space, env.action_space)
    
    # Run backtest
    backtester = Backtester(data, agent)
    results = backtester.run_backtest(
        start_date=config.backtest.test_start,
        end_date=config.backtest.test_end
    )
    
    print(f"Backtest Results:")
    print(f"Total Return: {results.total_return:.2%}")
    print(f"Sharpe Ratio: {results.sharpe_ratio:.3f}")
    print(f"Max Drawdown: {results.max_drawdown:.2%}")
    print(f"Win Rate: {results.win_rate:.2%}")
    
    # Create visualizations
    visualizer = BacktestVisualizer(results)
    visualizer.generate_report_html()
    
    # Run Monte Carlo simulation
    mc_backtester = MonteCarloBacktester(backtester)
    mc_results = mc_backtester.run_monte_carlo(n_simulations=100)
    
    print(f"\nMonte Carlo Analysis:")
    print(f"Expected Return: {mc_results['metrics_distribution']['total_return']['mean']:.2%}")
    print(f"95% Confidence Interval: {mc_results['confidence_intervals']['total_return_95']}")
