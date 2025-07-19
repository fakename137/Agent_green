"""
Real-time trading interface for live ETH scalping
"""
import asyncio
import websockets
import json
import pandas as pd
import numpy as np
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Callable
import threading
import time
from dataclasses import dataclass, field
from enum import Enum
import ccxt
from pathlib import Path
import schedule
from config import config
from trading_environment import TradingEnvironment
from ppo_agent import PPOAgent
from risk_manager import RiskManager, RiskAwareEnvironment
from data_collector import DataCollector
from lstm_predictor import LSTMPredictor

logging.basicConfig(level=getattr(logging, config.log_level))
logger = logging.getLogger(__name__)

class OrderStatus(Enum):
    """Order status types"""
    PENDING = "pending"
    FILLED = "filled"
    CANCELLED = "cancelled"
    REJECTED = "rejected"

class OrderType(Enum):
    """Order types"""
    MARKET = "market"
    LIMIT = "limit"
    STOP = "stop"
    STOP_LIMIT = "stop_limit"

@dataclass
class Order:
    """Order object"""
    id: str
    symbol: str
    side: str  # 'buy' or 'sell'
    amount: float
    price: Optional[float]
    order_type: OrderType
    status: OrderStatus = OrderStatus.PENDING
    timestamp: datetime = field(default_factory=datetime.now)
    filled_amount: float = 0.0
    average_price: float = 0.0
    fees: float = 0.0

@dataclass
class MarketData:
    """Real-time market data"""
    symbol: str
    timestamp: datetime
    bid: float
    ask: float
    last_price: float
    volume: float
    change_24h: float

class WebSocketDataFeed:
    """WebSocket data feed for real-time market data"""
    
    def __init__(self, exchange_name: str = "binance"):
        self.exchange_name = exchange_name
        self.ws_url = self._get_ws_url()
        self.subscribers: List[Callable] = []
        self.is_running = False
        self.websocket = None
        
    def _get_ws_url(self) -> str:
        """Get WebSocket URL for exchange"""
        ws_urls = {
            "binance": "wss://stream.binance.com:9443/ws/ethusdt@ticker",
            "coinbase": "wss://ws-feed.pro.coinbase.com",
            "kraken": "wss://ws.kraken.com"
        }
        return ws_urls.get(self.exchange_name, ws_urls["binance"])
    
    def subscribe(self, callback: Callable[[MarketData], None]):
        """Subscribe to market data updates"""
        self.subscribers.append(callback)
    
    async def start(self):
        """Start WebSocket connection"""
        self.is_running = True
        
        try:
            if self.exchange_name == "binance":
                await self._handle_binance_stream()
            elif self.exchange_name == "coinbase":
                await self._handle_coinbase_stream()
            else:
                logger.error(f"Unsupported exchange: {self.exchange_name}")
        
        except Exception as e:
            logger.error(f"WebSocket error: {e}")
        finally:
            self.is_running = False
    
    async def _handle_binance_stream(self):
        """Handle Binance WebSocket stream"""
        
        async with websockets.connect(self.ws_url) as websocket:
            self.websocket = websocket
            logger.info("Connected to Binance WebSocket")
            
            while self.is_running:
                try:
                    message = await websocket.recv()
                    data = json.loads(message)
                    
                    market_data = MarketData(
                        symbol="ETH/USDT",
                        timestamp=datetime.fromtimestamp(data['E'] / 1000),
                        bid=float(data['b']),
                        ask=float(data['a']),
                        last_price=float(data['c']),
                        volume=float(data['v']),
                        change_24h=float(data['P'])
                    )
                    
                    # Notify subscribers
                    for callback in self.subscribers:
                        try:
                            callback(market_data)
                        except Exception as e:
                            logger.error(f"Callback error: {e}")
                
                except websockets.exceptions.ConnectionClosed:
                    logger.warning("WebSocket connection closed")
                    break
                except Exception as e:
                    logger.error(f"Error processing message: {e}")
    
    async def _handle_coinbase_stream(self):
        """Handle Coinbase WebSocket stream"""
        
        subscribe_message = {
            "type": "subscribe",
            "product_ids": ["ETH-USD"],
            "channels": ["ticker"]
        }
        
        async with websockets.connect(self.ws_url) as websocket:
            await websocket.send(json.dumps(subscribe_message))
            logger.info("Connected to Coinbase WebSocket")
            
            while self.is_running:
                try:
                    message = await websocket.recv()
                    data = json.loads(message)
                    
                    if data.get('type') == 'ticker':
                        market_data = MarketData(
                            symbol="ETH/USD",
                            timestamp=datetime.fromisoformat(data['time'].replace('Z', '+00:00')),
                            bid=float(data['best_bid']),
                            ask=float(data['best_ask']),
                            last_price=float(data['price']),
                            volume=float(data['volume_24h']),
                            change_24h=0.0  # Not directly available
                        )
                        
                        # Notify subscribers
                        for callback in self.subscribers:
                            try:
                                callback(market_data)
                            except Exception as e:
                                logger.error(f"Callback error: {e}")
                
                except websockets.exceptions.ConnectionClosed:
                    logger.warning("WebSocket connection closed")
                    break
                except Exception as e:
                    logger.error(f"Error processing message: {e}")
    
    def stop(self):
        """Stop WebSocket connection"""
        self.is_running = False

class ExchangeInterface:
    """Interface for exchange operations"""
    
    def __init__(self, exchange_name: str = "binance"):
        self.exchange_name = exchange_name
        self.exchange = self._init_exchange()
        self.orders: Dict[str, Order] = {}
        
    def _init_exchange(self) -> ccxt.Exchange:
        """Initialize exchange connection"""
        
        exchanges = {
            "binance": ccxt.binance,
            "coinbase": ccxt.coinbasepro,
            "kraken": ccxt.kraken
        }
        
        if self.exchange_name not in exchanges:
            raise ValueError(f"Unsupported exchange: {self.exchange_name}")
        
        exchange_class = exchanges[self.exchange_name]
        
        # Initialize with API keys
        exchange = exchange_class({
            'apiKey': getattr(config, f'{self.exchange_name}_api_key', ''),
            'secret': getattr(config, f'{self.exchange_name}_secret_key', ''),
            'sandbox': True,  # Use sandbox for testing
            'enableRateLimit': True,
        })
        
        return exchange
    
    async def place_order(self, symbol: str, side: str, amount: float, 
                         order_type: OrderType = OrderType.MARKET,
                         price: Optional[float] = None) -> Order:
        """Place trading order"""
        
        try:
            # Validate order
            if amount <= 0:
                raise ValueError("Order amount must be positive")
            
            # Create order parameters
            order_params = {
                'symbol': symbol,
                'type': order_type.value,
                'side': side,
                'amount': amount
            }
            
            if order_type in [OrderType.LIMIT, OrderType.STOP_LIMIT] and price:
                order_params['price'] = price
            
            # Place order on exchange
            exchange_order = await self.exchange.create_order(**order_params)
            
            # Create our order object
            order = Order(
                id=exchange_order['id'],
                symbol=symbol,
                side=side,
                amount=amount,
                price=price,
                order_type=order_type,
                status=OrderStatus.PENDING
            )
            
            self.orders[order.id] = order
            
            logger.info(f"Order placed: {order.id} - {side} {amount} {symbol}")
            
            return order
        
        except Exception as e:
            logger.error(f"Error placing order: {e}")
            raise
    
    async def cancel_order(self, order_id: str) -> bool:
        """Cancel order"""
        
        try:
            if order_id not in self.orders:
                return False
            
            order = self.orders[order_id]
            
            # Cancel on exchange
            await self.exchange.cancel_order(order_id, order.symbol)
            
            # Update order status
            order.status = OrderStatus.CANCELLED
            
            logger.info(f"Order cancelled: {order_id}")
            
            return True
        
        except Exception as e:
            logger.error(f"Error cancelling order: {e}")
            return False
    
    async def get_order_status(self, order_id: str) -> Optional[Order]:
        """Get order status"""
        
        try:
            if order_id not in self.orders:
                return None
            
            order = self.orders[order_id]
            
            # Fetch from exchange
            exchange_order = await self.exchange.fetch_order(order_id, order.symbol)
            
            # Update order status
            order.status = OrderStatus(exchange_order['status'])
            order.filled_amount = exchange_order['filled']
            order.average_price = exchange_order['average'] or 0
            order.fees = exchange_order['fee']['cost'] if exchange_order['fee'] else 0
            
            return order
        
        except Exception as e:
            logger.error(f"Error fetching order status: {e}")
            return None
    
    async def get_balance(self) -> Dict[str, float]:
        """Get account balance"""
        
        try:
            balance = await self.exchange.fetch_balance()
            return {
                'USD': balance.get('USDT', {}).get('free', 0) or balance.get('USD', {}).get('free', 0),
                'ETH': balance.get('ETH', {}).get('free', 0)
            }
        
        except Exception as e:
            logger.error(f"Error fetching balance: {e}")
            return {'USD': 0, 'ETH': 0}
    
    async def get_position(self) -> Dict[str, Any]:
        """Get current position"""
        
        try:
            balance = await self.get_balance()
            
            # Calculate position (simplified)
            eth_balance = balance['ETH']
            usd_balance = balance['USD']
            
            # Get current price for valuation
            ticker = await self.exchange.fetch_ticker('ETH/USDT')
            current_price = ticker['last']
            
            total_value = usd_balance + eth_balance * current_price
            position_size = eth_balance / (total_value / current_price) if total_value > 0 else 0
            
            return {
                'eth_balance': eth_balance,
                'usd_balance': usd_balance,
                'total_value': total_value,
                'position_size': position_size,
                'current_price': current_price
            }
        
        except Exception as e:
            logger.error(f"Error getting position: {e}")
            return {}

class RealTimeTrader:
    """Main real-time trading system"""
    
    def __init__(self, agent: PPOAgent, lstm_predictor: LSTMPredictor = None):
        self.agent = agent
        self.lstm_predictor = lstm_predictor
        
        # Components
        self.data_feed = WebSocketDataFeed()
        self.exchange = ExchangeInterface()
        self.risk_manager = RiskManager()
        self.data_collector = DataCollector()
        
        # State
        self.is_running = False
        self.market_data_buffer: List[MarketData] = []
        self.historical_data: pd.DataFrame = pd.DataFrame()
        self.current_position = 0.0
        self.last_action_time = datetime.now()
        
        # Trading parameters
        self.min_trade_interval = timedelta(minutes=1)  # Minimum time between trades
        self.max_position_size = config.environment.max_position_size
        
        # Performance tracking
        self.trades_today = 0
        self.pnl_today = 0.0
        self.start_balance = 0.0
        
        # Subscribe to market data
        self.data_feed.subscribe(self._on_market_data)
        
        logger.info("Real-time trader initialized")
    
    async def start(self):
        """Start real-time trading"""
        
        logger.info("Starting real-time trading system...")
        
        self.is_running = True
        
        # Get initial balance
        balance = await self.exchange.get_balance()
        self.start_balance = balance['USD'] + balance['ETH'] * 2000  # Rough estimate
        
        # Load historical data
        await self._load_historical_data()
        
        # Start data feed
        data_feed_task = asyncio.create_task(self.data_feed.start())
        
        # Start trading loop
        trading_task = asyncio.create_task(self._trading_loop())
        
        # Start monitoring tasks
        monitoring_task = asyncio.create_task(self._monitoring_loop())
        
        try:
            await asyncio.gather(data_feed_task, trading_task, monitoring_task)
        except Exception as e:
            logger.error(f"Error in trading system: {e}")
        finally:
            await self.stop()
    
    async def stop(self):
        """Stop real-time trading"""
        
        logger.info("Stopping real-time trading system...")
        
        self.is_running = False
        self.data_feed.stop()
        
        # Close any open positions (optional)
        # await self._close_all_positions()
        
        logger.info("Trading system stopped")
    
    def _on_market_data(self, market_data: MarketData):
        """Handle incoming market data"""
        
        # Add to buffer
        self.market_data_buffer.append(market_data)
        
        # Keep only recent data
        cutoff_time = datetime.now() - timedelta(hours=1)
        self.market_data_buffer = [
            data for data in self.market_data_buffer 
            if data.timestamp > cutoff_time
        ]
        
        # Update historical data
        self._update_historical_data(market_data)
    
    def _update_historical_data(self, market_data: MarketData):
        """Update historical data with new market data"""
        
        # Convert market data to OHLCV format (simplified)
        new_row = {
            'timestamp': market_data.timestamp,
            'open': market_data.last_price,
            'high': market_data.last_price,
            'low': market_data.last_price,
            'close': market_data.last_price,
            'volume': market_data.volume
        }
        
        # Add to historical data
        if len(self.historical_data) == 0:
            self.historical_data = pd.DataFrame([new_row])
            self.historical_data.set_index('timestamp', inplace=True)
        else:
            # Update or append
            if market_data.timestamp not in self.historical_data.index:
                new_df = pd.DataFrame([new_row])
                new_df.set_index('timestamp', inplace=True)
                self.historical_data = pd.concat([self.historical_data, new_df])
            else:
                # Update existing row (for OHLCV aggregation)
                self.historical_data.loc[market_data.timestamp, 'close'] = market_data.last_price
                self.historical_data.loc[market_data.timestamp, 'high'] = max(
                    self.historical_data.loc[market_data.timestamp, 'high'],
                    market_data.last_price
                )
                self.historical_data.loc[market_data.timestamp, 'low'] = min(
                    self.historical_data.loc[market_data.timestamp, 'low'],
                    market_data.last_price
                )
        
        # Keep only recent data
        cutoff_time = datetime.now() - timedelta(hours=24)
        self.historical_data = self.historical_data[self.historical_data.index > cutoff_time]
    
    async def _load_historical_data(self):
        """Load initial historical data"""
        
        try:
            # Use data collector to get recent data
            self.historical_data = await self.data_collector.collect_data(save=False)
            
            # Keep only recent data
            cutoff_time = datetime.now() - timedelta(hours=24)
            self.historical_data = self.historical_data[self.historical_data.index > cutoff_time]
            
            logger.info(f"Loaded historical data: {len(self.historical_data)} records")
        
        except Exception as e:
            logger.error(f"Error loading historical data: {e}")
            self.historical_data = pd.DataFrame()
    
    async def _trading_loop(self):
        """Main trading decision loop"""
        
        while self.is_running:
            try:
                await self._make_trading_decision()
                await asyncio.sleep(5)  # Check every 5 seconds
            
            except Exception as e:
                logger.error(f"Error in trading loop: {e}")
                await asyncio.sleep(10)
    
    async def _make_trading_decision(self):
        """Make trading decision based on current market state"""
        
        # Check if we have enough data
        if len(self.historical_data) < 100:
            return
        
        # Check time constraints
        if datetime.now() - self.last_action_time < self.min_trade_interval:
            return
        
        # Check trading limits
        if self.trades_today >= config.environment.max_daily_trades:
            return
        
        # Check risk limits
        if not self.risk_manager.should_resume_trading():
            return
        
        try:
            # Prepare data for agent
            processed_data = self.data_collector.preprocess_data(self.historical_data.copy())
            
            if len(processed_data) < config.environment.warmup_period:
                return
            
            # Create temporary environment for observation
            temp_env = TradingEnvironment(processed_data)
            obs, _ = temp_env.reset()
            
            # Get agent action
            action, _, _ = self.agent.get_action(obs, deterministic=True)
            
            # Parse action
            position_change = action[0]  # -1 to 1
            
            # Get current position
            position_info = await self.exchange.get_position()
            current_position_size = position_info.get('position_size', 0)
            
            # Calculate target position
            target_position = np.clip(
                current_position_size + position_change * self.max_position_size,
                -self.max_position_size,
                self.max_position_size
            )
            
            # Execute trade if significant change
            position_diff = target_position - current_position_size
            
            if abs(position_diff) > 0.01:  # 1% threshold
                await self._execute_trade(position_diff, position_info['current_price'])
        
        except Exception as e:
            logger.error(f"Error making trading decision: {e}")
    
    async def _execute_trade(self, position_change: float, current_price: float):
        """Execute trading order"""
        
        try:
            # Calculate trade amount
            balance = await self.exchange.get_balance()
            total_value = balance['USD'] + balance['ETH'] * current_price
            
            trade_amount = abs(position_change) * total_value / current_price
            
            # Minimum trade size check
            if trade_amount < 0.001:  # Minimum 0.001 ETH
                return
            
            # Determine side
            side = 'buy' if position_change > 0 else 'sell'
            
            # Risk check
            if not self._check_trade_risk(side, trade_amount, current_price):
                logger.warning("Trade rejected by risk management")
                return
            
            # Place order
            order = await self.exchange.place_order(
                symbol='ETH/USDT',
                side=side,
                amount=trade_amount,
                order_type=OrderType.MARKET
            )
            
            logger.info(f"Trade executed: {side} {trade_amount:.4f} ETH at ${current_price:.2f}")
            
            # Update tracking
            self.trades_today += 1
            self.last_action_time = datetime.now()
            
            # Update risk manager
            trade_result = {
                'pnl': 0,  # Will be calculated later
                'portfolio_value': total_value
            }
            self.risk_manager.update_risk_state(trade_result, total_value)
        
        except Exception as e:
            logger.error(f"Error executing trade: {e}")
    
    def _check_trade_risk(self, side: str, amount: float, price: float) -> bool:
        """Check if trade passes risk management"""
        
        # Basic risk checks
        trade_value = amount * price
        
        # Position size limit
        if trade_value > self.max_position_size * 100000:  # Assuming $100k portfolio
            return False
        
        # Daily loss limit
        if abs(self.pnl_today) > config.risk.daily_loss_limit * 100000:
            return False
        
        return True
    
    async def _monitoring_loop(self):
        """Monitor system health and performance"""
        
        while self.is_running:
            try:
                await self._update_performance_metrics()
                await self._check_system_health()
                await asyncio.sleep(60)  # Check every minute
            
            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}")
                await asyncio.sleep(60)
    
    async def _update_performance_metrics(self):
        """Update performance tracking"""
        
        try:
            balance = await self.exchange.get_balance()
            current_value = balance['USD'] + balance['ETH'] * 2000  # Rough estimate
            
            self.pnl_today = current_value - self.start_balance
            
            # Log performance
            if datetime.now().minute == 0:  # Every hour
                logger.info(f"Performance - Trades: {self.trades_today}, PnL: ${self.pnl_today:.2f}")
        
        except Exception as e:
            logger.error(f"Error updating performance metrics: {e}")
    
    async def _check_system_health(self):
        """Check system health and connectivity"""
        
        try:
            # Check WebSocket connection
            if not self.data_feed.is_running:
                logger.warning("WebSocket connection lost - attempting reconnect")
                asyncio.create_task(self.data_feed.start())
            
            # Check exchange connectivity
            await self.exchange.get_balance()
            
            # Check data freshness
            if self.market_data_buffer:
                last_data_time = max(data.timestamp for data in self.market_data_buffer)
                if datetime.now() - last_data_time > timedelta(minutes=5):
                    logger.warning("Market data is stale")
        
        except Exception as e:
            logger.error(f"System health check failed: {e}")

class TradingDashboard:
    """Simple dashboard for monitoring trading system"""
    
    def __init__(self, trader: RealTimeTrader):
        self.trader = trader
        
    def get_status(self) -> Dict[str, Any]:
        """Get current system status"""
        
        return {
            'is_running': self.trader.is_running,
            'trades_today': self.trader.trades_today,
            'pnl_today': self.trader.pnl_today,
            'current_position': self.trader.current_position,
            'data_buffer_size': len(self.trader.market_data_buffer),
            'last_data_time': max(
                (data.timestamp for data in self.trader.market_data_buffer), 
                default=None
            ),
            'risk_status': {
                'trading_halted': self.trader.risk_manager.trading_halted,
                'consecutive_losses': self.trader.risk_manager.consecutive_losses,
                'daily_loss': self.trader.risk_manager.daily_loss
            }
        }
    
    def get_recent_trades(self, limit: int = 10) -> List[Dict]:
        """Get recent trades"""
        
        # This would typically come from a database
        # For now, return empty list
        return []
    
    def get_performance_summary(self) -> Dict[str, Any]:
        """Get performance summary"""
        
        return {
            'start_balance': self.trader.start_balance,
            'current_pnl': self.trader.pnl_today,
            'return_pct': self.trader.pnl_today / self.trader.start_balance if self.trader.start_balance > 0 else 0,
            'trades_count': self.trader.trades_today,
            'avg_trade_pnl': self.trader.pnl_today / max(1, self.trader.trades_today)
        }

# Utility functions for scheduling and management

def schedule_daily_reset(trader: RealTimeTrader):
    """Schedule daily reset of trading metrics"""
    
    def reset_daily_metrics():
        trader.trades_today = 0
        trader.pnl_today = 0.0
        trader.risk_manager.daily_loss = 0.0
        trader.risk_manager.consecutive_losses = 0
        logger.info("Daily metrics reset")
    
    schedule.every().day.at("00:00").do(reset_daily_metrics)

def run_scheduler():
    """Run scheduled tasks"""
    while True:
        schedule.run_pending()
        time.sleep(60)

if __name__ == "__main__":
    # Example usage
    import sys
    from ppo_agent import PPOAgent
    from trading_environment import TradingEnvironment
    from data_collector import DataCollector
    
    async def main():
        # Load trained agent
        try:
            # Create dummy environment to get spaces
            collector = DataCollector()
            data = await collector.collect_data()
            env = TradingEnvironment(data)
            
            # Create agent
            agent = PPOAgent(env.observation_space, env.action_space)
            
            # Try to load trained model
            model_path = Path(config.save_dir) / "ppo" / "best_reward_model.pth"
            if model_path.exists():
                agent.load_model(str(model_path))
                logger.info("Loaded trained agent")
            else:
                logger.warning("No trained model found - using random agent")
            
            # Create trader
            trader = RealTimeTrader(agent)
            
            # Schedule daily reset
            schedule_daily_reset(trader)
            
            # Start scheduler in background
            scheduler_thread = threading.Thread(target=run_scheduler, daemon=True)
            scheduler_thread.start()
            
            # Start trading
            await trader.start()
        
        except KeyboardInterrupt:
            logger.info("Shutting down...")
            await trader.stop()
        except Exception as e:
            logger.error(f"Fatal error: {e}")
            sys.exit(1)
    
    # Run the trading system
    asyncio.run(main())
