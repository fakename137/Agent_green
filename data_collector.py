"""
Data collection and preprocessing module for ETH trading data
"""
import asyncio
import ccxt
import pandas as pd
import numpy as np
import ta
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
import logging
from pathlib import Path
import yfinance as yf
from tqdm import tqdm
import time
from config import config

logging.basicConfig(level=getattr(logging, config.log_level))
logger = logging.getLogger(__name__)

class DataCollector:
    """Collects and preprocesses trading data from multiple sources"""
    
    def __init__(self):
        self.exchanges = self._init_exchanges()
        self.data_dir = Path(config.data.data_dir)
        self.data_dir.mkdir(exist_ok=True)
        
    def _init_exchanges(self) -> Dict[str, ccxt.Exchange]:
        """Initialize exchange connections"""
        exchanges = {}
        
        try:
            if "binance" in config.data.exchanges:
                exchanges["binance"] = ccxt.binance({
                    'apiKey': config.binance_api_key,
                    'secret': config.binance_secret_key,
                    'sandbox': False,
                    'rateLimit': 1200,
                })
                
            if "coinbase" in config.data.exchanges:
                exchanges["coinbase"] = ccxt.coinbase({
                    'apiKey': config.coinbase_api_key,
                    'secret': config.coinbase_secret_key,
                    'sandbox': False,
                    'rateLimit': 1000,
                })
                
            if "kraken" in config.data.exchanges:
                exchanges["kraken"] = ccxt.kraken({
                    'rateLimit': 3000,
                })
                
        except Exception as e:
            logger.warning(f"Error initializing exchanges: {e}")
            
        return exchanges
    
    async def fetch_ohlcv(self, 
                          exchange_name: str, 
                          symbol: str, 
                          timeframe: str,
                          since: Optional[int] = None,
                          limit: int = 1000) -> pd.DataFrame:
        """Fetch OHLCV data from exchange"""
        
        try:
            exchange = self.exchanges[exchange_name]
            
            if since is None:
                since = exchange.parse8601(
                    (datetime.now() - timedelta(days=config.data.historical_days)).isoformat()
                )
            
            ohlcv = await exchange.fetch_ohlcv(symbol, timeframe, since, limit)
            
            df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
            df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
            df.set_index('timestamp', inplace=True)
            
            return df
            
        except Exception as e:
            logger.error(f"Error fetching data from {exchange_name}: {e}")
            return pd.DataFrame()
    
    def fetch_yfinance_data(self, symbol: str = "ETH-USD", period: str = "1y") -> pd.DataFrame:
        """Fetch data from Yahoo Finance as backup"""
        try:
            ticker = yf.Ticker(symbol)
            df = ticker.history(period=period, interval="5m")
            df.columns = [col.lower() for col in df.columns]
            return df
        except Exception as e:
            logger.error(f"Error fetching yfinance data: {e}")
            return pd.DataFrame()
    
    def add_technical_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add technical indicators to OHLCV data"""
        
        # Price-based indicators
        df['sma_20'] = ta.trend.sma_indicator(df['close'], window=20)
        df['ema_12'] = ta.trend.ema_indicator(df['close'], window=12)
        df['ema_26'] = ta.trend.ema_indicator(df['close'], window=26)
        
        # Momentum indicators
        df['rsi'] = ta.momentum.rsi(df['close'])
        df['stoch_k'] = ta.momentum.stoch(df['high'], df['low'], df['close'])
        df['stoch_d'] = ta.momentum.stoch_signal(df['high'], df['low'], df['close'])
        df['williams_r'] = ta.momentum.williams_r(df['high'], df['low'], df['close'])
        
        # MACD
        macd_line, macd_signal, macd_histogram = ta.trend.MACD(df['close']).macd(), \
                                                ta.trend.MACD(df['close']).macd_signal(), \
                                                ta.trend.MACD(df['close']).macd_diff()
        df['macd'] = macd_line
        df['macd_signal'] = macd_signal
        df['macd_histogram'] = macd_histogram
        
        # Bollinger Bands
        bb = ta.volatility.BollingerBands(df['close'])
        df['bb_upper'] = bb.bollinger_hband()
        df['bb_middle'] = bb.bollinger_mavg()
        df['bb_lower'] = bb.bollinger_lband()
        df['bb_width'] = bb.bollinger_wband()
        df['bb_percent'] = bb.bollinger_pband()
        
        # Volume indicators
        df['obv'] = ta.volume.on_balance_volume(df['close'], df['volume'])
        df['vwap'] = ta.volume.volume_weighted_average_price(df['high'], df['low'], df['close'], df['volume'])
        df['mfi'] = ta.volume.money_flow_index(df['high'], df['low'], df['close'], df['volume'])
        
        # Volatility indicators
        df['atr'] = ta.volatility.average_true_range(df['high'], df['low'], df['close'])
        df['kc_upper'] = ta.volatility.keltner_channel_hband(df['high'], df['low'], df['close'])
        df['kc_lower'] = ta.volatility.keltner_channel_lband(df['high'], df['low'], df['close'])
        
        # Trend indicators
        df['adx'] = ta.trend.adx(df['high'], df['low'], df['close'])
        df['cci'] = ta.trend.cci(df['high'], df['low'], df['close'])
        df['dpo'] = ta.trend.dpo(df['close'])
        
        return df
    
    def add_price_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add price-based features"""
        
        # Returns
        df['returns'] = df['close'].pct_change()
        df['log_returns'] = np.log(df['close'] / df['close'].shift(1))
        
        # Price levels
        df['hl_ratio'] = df['high'] / df['low']
        df['oc_ratio'] = df['open'] / df['close']
        df['price_range'] = (df['high'] - df['low']) / df['close']
        
        # Rolling statistics
        for window in [5, 10, 20, 50]:
            df[f'rolling_mean_{window}'] = df['close'].rolling(window).mean()
            df[f'rolling_std_{window}'] = df['close'].rolling(window).std()
            df[f'rolling_min_{window}'] = df['close'].rolling(window).min()
            df[f'rolling_max_{window}'] = df['close'].rolling(window).max()
            df[f'price_position_{window}'] = (df['close'] - df[f'rolling_min_{window}']) / \
                                           (df[f'rolling_max_{window}'] - df[f'rolling_min_{window}'])
        
        # Volatility features
        df['volatility_5'] = df['returns'].rolling(5).std()
        df['volatility_20'] = df['returns'].rolling(20).std()
        df['volatility_ratio'] = df['volatility_5'] / df['volatility_20']
        
        # Volume features
        df['volume_sma'] = df['volume'].rolling(20).mean()
        df['volume_ratio'] = df['volume'] / df['volume_sma']
        df['price_volume'] = df['close'] * df['volume']
        
        return df
    
    def add_temporal_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add time-based features"""
        
        df['hour'] = df.index.hour
        df['minute'] = df.index.minute
        df['day_of_week'] = df.index.dayofweek
        df['day_of_month'] = df.index.day
        df['month'] = df.index.month
        
        # Cyclical encoding
        df['hour_sin'] = np.sin(2 * np.pi * df['hour'] / 24)
        df['hour_cos'] = np.cos(2 * np.pi * df['hour'] / 24)
        df['dow_sin'] = np.sin(2 * np.pi * df['day_of_week'] / 7)
        df['dow_cos'] = np.cos(2 * np.pi * df['day_of_week'] / 7)
        df['month_sin'] = np.sin(2 * np.pi * df['month'] / 12)
        df['month_cos'] = np.cos(2 * np.pi * df['month'] / 12)
        
        # Market session indicators
        df['asian_session'] = ((df['hour'] >= 0) & (df['hour'] < 8)).astype(int)
        df['london_session'] = ((df['hour'] >= 8) & (df['hour'] < 16)).astype(int)
        df['ny_session'] = ((df['hour'] >= 16) & (df['hour'] < 24)).astype(int)
        
        return df
    
    def create_sequences(self, df: pd.DataFrame, 
                        sequence_length: int = None,
                        prediction_horizon: int = None) -> Tuple[np.ndarray, np.ndarray]:
        """Create sequences for LSTM training"""
        
        if sequence_length is None:
            sequence_length = config.data.lookback_window
        if prediction_horizon is None:
            prediction_horizon = config.data.prediction_horizon
            
        # Select features (exclude non-numeric columns)
        feature_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        features = df[feature_cols].values
        
        # Create target (future price movements)
        target = df['close'].shift(-prediction_horizon).pct_change()
        
        X, y = [], []
        
        for i in range(sequence_length, len(features) - prediction_horizon):
            X.append(features[i-sequence_length:i])
            y.append(target.iloc[i])
            
        return np.array(X), np.array(y)
    
    def preprocess_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """Complete preprocessing pipeline"""
        
        logger.info("Adding technical indicators...")
        df = self.add_technical_indicators(df)
        
        logger.info("Adding price features...")
        df = self.add_price_features(df)
        
        logger.info("Adding temporal features...")
        df = self.add_temporal_features(df)
        
        # Handle missing values
        df = df.fillna(method='forward').fillna(method='backward')
        
        # Remove infinite values
        df = df.replace([np.inf, -np.inf], np.nan).dropna()
        
        return df
    
    async def collect_data(self, save: bool = True) -> pd.DataFrame:
        """Main data collection function"""
        
        logger.info("Starting data collection...")
        
        all_data = []
        
        # Collect from multiple exchanges
        for exchange_name in self.exchanges.keys():
            logger.info(f"Collecting data from {exchange_name}...")
            
            df = await self.fetch_ohlcv(
                exchange_name=exchange_name,
                symbol=config.data.symbol,
                timeframe=config.data.base_timeframe
            )
            
            if not df.empty:
                df['exchange'] = exchange_name
                all_data.append(df)
        
        # Fallback to yfinance if no exchange data
        if not all_data:
            logger.info("No exchange data available, using yfinance...")
            df = self.fetch_yfinance_data()
            if not df.empty:
                df['exchange'] = 'yfinance'
                all_data.append(df)
        
        if not all_data:
            raise ValueError("No data could be collected from any source")
        
        # Combine data (use first exchange as primary)
        combined_df = all_data[0].copy()
        
        # Add preprocessing
        processed_df = self.preprocess_data(combined_df)
        
        if save:
            filepath = self.data_dir / f"eth_data_{config.data.base_timeframe}.csv"
            processed_df.to_csv(filepath)
            logger.info(f"Data saved to {filepath}")
        
        logger.info(f"Data collection complete. Shape: {processed_df.shape}")
        return processed_df

class MultiTimeframeCollector:
    """Collects data across multiple timeframes for enhanced features"""
    
    def __init__(self):
        self.collector = DataCollector()
        
    async def collect_multitimeframe_data(self) -> Dict[str, pd.DataFrame]:
        """Collect data across multiple timeframes"""
        
        timeframes = [config.data.base_timeframe] + config.data.additional_timeframes
        data = {}
        
        for tf in timeframes:
            logger.info(f"Collecting {tf} data...")
            
            # Temporarily change config for this timeframe
            original_tf = config.data.base_timeframe
            config.data.base_timeframe = tf
            
            try:
                df = await self.collector.collect_data(save=False)
                data[tf] = df
            except Exception as e:
                logger.error(f"Error collecting {tf} data: {e}")
            finally:
                # Restore original timeframe
                config.data.base_timeframe = original_tf
        
        return data
    
    def align_timeframes(self, data: Dict[str, pd.DataFrame]) -> pd.DataFrame:
        """Align multiple timeframe data to base timeframe"""
        
        base_tf = config.data.base_timeframe
        base_data = data[base_tf].copy()
        
        # Add features from higher timeframes
        for tf, df in data.items():
            if tf == base_tf:
                continue
                
            # Resample to base timeframe
            resampled = df.resample('5T').last()  # Assuming 5m base
            
            # Add suffix to column names
            resampled.columns = [f"{col}_{tf}" for col in resampled.columns]
            
            # Merge with base data
            base_data = base_data.join(resampled, how='left')
        
        # Forward fill missing values from higher timeframes
        base_data = base_data.fillna(method='forward')
        
        return base_data

if __name__ == "__main__":
    collector = DataCollector()
    
    # Run data collection
    loop = asyncio.get_event_loop()
    data = loop.run_until_complete(collector.collect_data())
    
    print(f"Collected data shape: {data.shape}")
    print(f"Columns: {list(data.columns)}")
