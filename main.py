"""
Main training and execution script for ETH scalping trading agent
"""
import asyncio
import argparse
import logging
from pathlib import Path
import torch
import numpy as np
import pandas as pd
from typing import Optional

from config import config
from data_collector import DataCollector, MultiTimeframeCollector
from lstm_predictor import LSTMPredictor
from trading_environment import TradingEnvironment
from ppo_agent import PPOAgent, PPOTrainer
from curriculum_meta_learning import CurriculumMetaTrainer
from risk_manager import RiskManager
from backtesting_framework import Backtester, BacktestVisualizer, MonteCarloBacktester
from real_time_trader import RealTimeTrader

logging.basicConfig(level=getattr(logging, config.log_level))
logger = logging.getLogger(__name__)

class ScalperAmp:
    """Main ScalperAmp trading system"""
    
    def __init__(self):
        self.data_collector = DataCollector()
        self.multi_collector = MultiTimeframeCollector()
        self.lstm_predictor = None
        self.agent = None
        self.risk_manager = RiskManager()
        
        # Create directories
        Path(config.save_dir).mkdir(parents=True, exist_ok=True)
        Path(config.log_dir).mkdir(parents=True, exist_ok=True)
        Path(config.data.data_dir).mkdir(parents=True, exist_ok=True)
        
        logger.info("ScalperAmp initialized")
    
    async def collect_data(self, save: bool = True) -> None:
        """Step 1: Collect and preprocess market data"""
        
        logger.info("=== STEP 1: DATA COLLECTION ===")
        
        try:
            # Collect multi-timeframe data
            data = await self.multi_collector.collect_multitimeframe_data()
            
            if not data:
                raise ValueError("No data collected from any source")
            
            # Align timeframes
            self.market_data = self.multi_collector.align_timeframes(data)
            
            if save:
                filepath = Path(config.data.data_dir) / "processed_market_data.csv"
                self.market_data.to_csv(filepath)
                logger.info(f"Market data saved to {filepath}")
            
            logger.info(f"Data collection completed. Shape: {self.market_data.shape}")
            
        except Exception as e:
            logger.error(f"Data collection failed: {e}")
            raise
    
    def train_lstm(self) -> None:
        """Step 2: Train LSTM price prediction model"""
        
        logger.info("=== STEP 2: LSTM TRAINING ===")
        
        if not hasattr(self, 'market_data'):
            raise ValueError("Market data not loaded. Run collect_data() first.")
        
        try:
            # Initialize LSTM predictor
            self.lstm_predictor = LSTMPredictor(model_type="attention")
            
            # Prepare data
            X, y = self.lstm_predictor.prepare_data(self.market_data)
            
            logger.info(f"LSTM training data shape: X={X.shape}, y={y.shape}")
            
            # Train model
            self.lstm_predictor.train(X, y)
            
            # Evaluate model
            metrics = self.lstm_predictor.evaluate_predictions(X[-1000:], y[-1000:])
            logger.info(f"LSTM evaluation metrics: {metrics}")
            
            # Plot training history
            self.lstm_predictor.plot_training_history()
            
            logger.info("LSTM training completed")
            
        except Exception as e:
            logger.error(f"LSTM training failed: {e}")
            raise
    
    def train_ppo_agent(self, use_curriculum: bool = True, total_timesteps: int = 1000000) -> None:
        """Step 3: Train PPO agent with optional curriculum learning"""
        
        logger.info("=== STEP 3: PPO AGENT TRAINING ===")
        
        if not hasattr(self, 'market_data'):
            raise ValueError("Market data not loaded. Run collect_data() first.")
        
        try:
            # Create trading environment
            env = TradingEnvironment(self.market_data, self.lstm_predictor)
            
            # Initialize PPO agent
            self.agent = PPOAgent(env.observation_space, env.action_space)
            
            if use_curriculum:
                # Use curriculum + meta-learning
                logger.info("Training with curriculum learning and meta-learning")
                trainer = CurriculumMetaTrainer(self.market_data, self.agent)
                trainer.train(total_episodes=total_timesteps // config.environment.episode_length)
                trainer.save_training_history()
            else:
                # Standard PPO training
                logger.info("Training with standard PPO")
                trainer = PPOTrainer(env, self.agent)
                trainer.train(total_timesteps)
            
            # Save final model
            self.agent.save_model("final_trained_model.pth")
            
            logger.info("PPO agent training completed")
            
        except Exception as e:
            logger.error(f"PPO agent training failed: {e}")
            raise
    
    def run_backtest(self, start_date: Optional[str] = None, 
                    end_date: Optional[str] = None) -> None:
        """Step 4: Run comprehensive backtesting"""
        
        logger.info("=== STEP 4: BACKTESTING ===")
        
        if not hasattr(self, 'agent') or self.agent is None:
            raise ValueError("Agent not trained. Run train_ppo_agent() first.")
        
        try:
            # Create backtester
            backtester = Backtester(self.market_data, self.agent)
            
            # Run backtest
            results = backtester.run_backtest(
                start_date=start_date or config.backtest.test_start,
                end_date=end_date or config.backtest.test_end
            )
            
            # Print results
            self._print_backtest_results(results)
            
            # Create visualizations
            visualizer = BacktestVisualizer(results)
            report_path = visualizer.generate_report_html()
            logger.info(f"Backtest report generated: {report_path}")
            
            # Run Monte Carlo simulation
            logger.info("Running Monte Carlo simulation...")
            mc_backtester = MonteCarloBacktester(backtester)
            mc_results = mc_backtester.run_monte_carlo(n_simulations=500)
            
            self._print_monte_carlo_results(mc_results)
            
            logger.info("Backtesting completed")
            
        except Exception as e:
            logger.error(f"Backtesting failed: {e}")
            raise
    
    async def run_live_trading(self) -> None:
        """Step 5: Run live trading system"""
        
        logger.info("=== STEP 5: LIVE TRADING ===")
        
        if not hasattr(self, 'agent') or self.agent is None:
            raise ValueError("Agent not trained. Run train_ppo_agent() first.")
        
        try:
            # Create real-time trader
            trader = RealTimeTrader(self.agent, self.lstm_predictor)
            
            # Start trading
            await trader.start()
            
        except Exception as e:
            logger.error(f"Live trading failed: {e}")
            raise
    
    def _print_backtest_results(self, results) -> None:
        """Print backtest results summary"""
        
        print("\n" + "="*60)
        print("BACKTEST RESULTS SUMMARY")
        print("="*60)
        print(f"Total Return:        {results.total_return:>10.2%}")
        print(f"Annualized Return:   {results.annualized_return:>10.2%}")
        print(f"Volatility:          {results.volatility:>10.2%}")
        print(f"Sharpe Ratio:        {results.sharpe_ratio:>10.3f}")
        print(f"Sortino Ratio:       {results.sortino_ratio:>10.3f}")
        print(f"Calmar Ratio:        {results.calmar_ratio:>10.3f}")
        print(f"Max Drawdown:        {results.max_drawdown:>10.2%}")
        print(f"VaR (95%):           {results.var_95:>10.2%}")
        print(f"Total Trades:        {results.total_trades:>10}")
        print(f"Win Rate:            {results.win_rate:>10.2%}")
        print(f"Profit Factor:       {results.profit_factor:>10.3f}")
        print(f"Alpha:               {results.alpha:>10.3f}")
        print(f"Beta:                {results.beta:>10.3f}")
        print(f"Information Ratio:   {results.information_ratio:>10.3f}")
        print("="*60)
    
    def _print_monte_carlo_results(self, mc_results) -> None:
        """Print Monte Carlo results summary"""
        
        print("\n" + "="*60)
        print("MONTE CARLO SIMULATION RESULTS")
        print("="*60)
        
        returns_stats = mc_results['metrics_distribution']['total_return']
        print(f"Expected Return:     {returns_stats['mean']:>10.2%}")
        print(f"Return Std Dev:      {returns_stats['std']:>10.2%}")
        print(f"5th Percentile:      {returns_stats['percentiles'][0.05]:>10.2%}")
        print(f"95th Percentile:     {returns_stats['percentiles'][0.95]:>10.2%}")
        
        risk_stats = mc_results['risk_metrics']
        print(f"Probability of Loss: {risk_stats['probability_of_loss']:>10.2%}")
        print(f"Expected Worst Case: {risk_stats['expected_worst_case']:>10.2%}")
        print("="*60)

async def main():
    """Main execution function"""
    
    parser = argparse.ArgumentParser(description="ScalperAmp ETH Trading Agent")
    parser.add_argument("--mode", choices=["train", "backtest", "live", "full"], 
                       default="full", help="Execution mode")
    parser.add_argument("--skip-data", action="store_true", 
                       help="Skip data collection (use existing data)")
    parser.add_argument("--skip-lstm", action="store_true", 
                       help="Skip LSTM training")
    parser.add_argument("--timesteps", type=int, default=1000000, 
                       help="Training timesteps")
    parser.add_argument("--no-curriculum", action="store_true", 
                       help="Disable curriculum learning")
    parser.add_argument("--start-date", type=str, 
                       help="Backtest start date (YYYY-MM-DD)")
    parser.add_argument("--end-date", type=str, 
                       help="Backtest end date (YYYY-MM-DD)")
    
    args = parser.parse_args()
    
    # Initialize system
    scalper = ScalperAmp()
    
    try:
        if args.mode in ["train", "full"]:
            # Data collection
            if not args.skip_data:
                await scalper.collect_data()
            else:
                # Load existing data
                data_path = Path(config.data.data_dir) / "processed_market_data.csv"
                if data_path.exists():
                    scalper.market_data = pd.read_csv(data_path, index_col=0, parse_dates=True)
                    logger.info(f"Loaded existing data: {scalper.market_data.shape}")
                else:
                    logger.error("No existing data found. Run without --skip-data")
                    return
            
            # LSTM training
            if not args.skip_lstm:
                scalper.train_lstm()
            
            # PPO training
            scalper.train_ppo_agent(
                use_curriculum=not args.no_curriculum,
                total_timesteps=args.timesteps
            )
        
        if args.mode in ["backtest", "full"]:
            # Load data if not already loaded
            if not hasattr(scalper, 'market_data'):
                data_path = Path(config.data.data_dir) / "processed_market_data.csv"
                if data_path.exists():
                    scalper.market_data = pd.read_csv(data_path, index_col=0, parse_dates=True)
                    logger.info(f"Loaded existing data: {scalper.market_data.shape}")
                else:
                    logger.error("No existing data found for backtesting")
                    return
            
            # Load agent if not already trained
            if not hasattr(scalper, 'agent') or scalper.agent is None:
                # Load existing model
                model_path = Path(config.save_dir) / "ppo" / "final_trained_model.pth"
                if model_path.exists():
                    # Create dummy environment to get spaces
                    env = TradingEnvironment(scalper.market_data)
                    scalper.agent = PPOAgent(env.observation_space, env.action_space)
                    scalper.agent.load_model(str(model_path))
                    logger.info("Loaded existing trained agent")
                else:
                    logger.error("No trained agent found. Run training first.")
                    return
            
            # Run backtest
            scalper.run_backtest(args.start_date, args.end_date)
        
        if args.mode == "live":
            # Load data if not already loaded
            if not hasattr(scalper, 'market_data'):
                data_path = Path(config.data.data_dir) / "processed_market_data.csv"
                if data_path.exists():
                    scalper.market_data = pd.read_csv(data_path, index_col=0, parse_dates=True)
                    logger.info(f"Loaded existing data: {scalper.market_data.shape}")
                else:
                    logger.error("No existing data found for live trading")
                    return
            
            # Load agent if not already trained
            if not hasattr(scalper, 'agent') or scalper.agent is None:
                model_path = Path(config.save_dir) / "ppo" / "final_trained_model.pth"
                if model_path.exists():
                    env = TradingEnvironment(scalper.market_data)
                    scalper.agent = PPOAgent(env.observation_space, env.action_space)
                    scalper.agent.load_model(str(model_path))
                    logger.info("Loaded existing trained agent for live trading")
                else:
                    logger.error("No trained agent found. Run training first.")
                    return
            
            # Run live trading
            logger.warning("LIVE TRADING MODE - USE WITH CAUTION!")
            await scalper.run_live_trading()
        
        logger.info("ScalperAmp execution completed successfully")
        
    except KeyboardInterrupt:
        logger.info("Execution interrupted by user")
    except Exception as e:
        logger.error(f"Execution failed: {e}")
        raise

if __name__ == "__main__":
    # Set random seeds for reproducibility
    torch.manual_seed(config.random_seed)
    np.random.seed(config.random_seed)
    
    # Run main
    asyncio.run(main())
