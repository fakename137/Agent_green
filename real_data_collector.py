"""
Real data collector using Binance free API for ETH/USDT historical data
"""
import ccxt
import pandas as pd
import numpy as np
import ta
import asyncio
import time
from datetime import datetime, timedelta
from pathlib import Path
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class RealDataCollector:
    """Collect real ETH/USDT data from Binance free API"""
    
    def __init__(self):
        # Initialize Binance exchange (no API keys needed for public data)
        self.exchange = ccxt.binance({
            'rateLimit': 1200,  # Be respectful to API limits
            'enableRateLimit': True,
        })
        
    def fetch_historical_data(self, symbol='ETH/USDT', timeframe='5m', days=30):
        """Fetch historical OHLCV data from Binance"""
        
        logger.info(f"Fetching {days} days of {symbol} {timeframe} data from Binance...")
        
        # Calculate since timestamp
        since = self.exchange.parse8601(
            (datetime.now() - timedelta(days=days)).isoformat()
        )
        
        all_ohlcv = []
        
        try:
            # Fetch data in chunks (Binance limits to 1000 candles per request)
            while True:
                logger.info(f"Fetching data from {datetime.fromtimestamp(since/1000)}")
                
                ohlcv = self.exchange.fetch_ohlcv(symbol, timeframe, since, limit=1000)
                
                if not ohlcv:
                    break
                
                all_ohlcv.extend(ohlcv)
                
                # Update since to last timestamp + 1
                since = ohlcv[-1][0] + 1
                
                # Check if we've reached current time
                if since > self.exchange.milliseconds():
                    break
                
                # Rate limiting
                time.sleep(0.5)
                
                # Safety check
                if len(all_ohlcv) > days * 24 * 12 * 2:  # 2x expected data points
                    break
            
            logger.info(f"Successfully fetched {len(all_ohlcv)} data points")
            
            # Convert to DataFrame
            df = pd.DataFrame(all_ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
            df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
            df.set_index('timestamp', inplace=True)
            
            # Remove duplicates
            df = df[~df.index.duplicated(keep='first')]
            
            # Sort by timestamp
            df = df.sort_index()
            
            logger.info(f"Final dataset: {len(df)} records from {df.index[0]} to {df.index[-1]}")
            
            return df
            
        except Exception as e:
            logger.error(f"Error fetching data: {e}")
            return pd.DataFrame()
    
    def add_technical_indicators(self, df):
        """Add comprehensive technical indicators"""
        
        logger.info("Adding technical indicators...")
        
        # Price-based indicators
        df['sma_5'] = ta.trend.sma_indicator(df['close'], window=5)
        df['sma_10'] = ta.trend.sma_indicator(df['close'], window=10)
        df['sma_20'] = ta.trend.sma_indicator(df['close'], window=20)
        df['sma_50'] = ta.trend.sma_indicator(df['close'], window=50)
        
        df['ema_5'] = ta.trend.ema_indicator(df['close'], window=5)
        df['ema_10'] = ta.trend.ema_indicator(df['close'], window=10)
        df['ema_20'] = ta.trend.ema_indicator(df['close'], window=20)
        df['ema_50'] = ta.trend.ema_indicator(df['close'], window=50)
        
        # Momentum indicators
        df['rsi'] = ta.momentum.rsi(df['close'], window=14)
        df['rsi_fast'] = ta.momentum.rsi(df['close'], window=7)
        df['rsi_slow'] = ta.momentum.rsi(df['close'], window=21)
        
        df['stoch_k'] = ta.momentum.stoch(df['high'], df['low'], df['close'])
        df['stoch_d'] = ta.momentum.stoch_signal(df['high'], df['low'], df['close'])
        
        df['williams_r'] = ta.momentum.williams_r(df['high'], df['low'], df['close'])
        
        # MACD
        macd = ta.trend.MACD(df['close'])
        df['macd'] = macd.macd()
        df['macd_signal'] = macd.macd_signal()
        df['macd_histogram'] = macd.macd_diff()
        
        # Bollinger Bands
        bb = ta.volatility.BollingerBands(df['close'], window=20)
        df['bb_upper'] = bb.bollinger_hband()
        df['bb_middle'] = bb.bollinger_mavg()
        df['bb_lower'] = bb.bollinger_lband()
        df['bb_width'] = bb.bollinger_wband()
        df['bb_percent'] = bb.bollinger_pband()
        
        # Volume indicators
        df['obv'] = ta.volume.on_balance_volume(df['close'], df['volume'])
        df['volume_sma'] = df['volume'].rolling(window=20).mean()
        df['vwap'] = ta.volume.volume_weighted_average_price(df['high'], df['low'], df['close'], df['volume'])
        
        # Volatility indicators
        df['atr'] = ta.volatility.average_true_range(df['high'], df['low'], df['close'])
        df['kc_upper'] = ta.volatility.keltner_channel_hband(df['high'], df['low'], df['close'])
        df['kc_lower'] = ta.volatility.keltner_channel_lband(df['high'], df['low'], df['close'])
        
        # Trend indicators
        df['adx'] = ta.trend.adx(df['high'], df['low'], df['close'])
        df['cci'] = ta.trend.cci(df['high'], df['low'], df['close'])
        
        # Price features
        df['returns'] = df['close'].pct_change()
        df['log_returns'] = np.log(df['close'] / df['close'].shift(1))
        df['hl_ratio'] = df['high'] / df['low']
        df['oc_ratio'] = df['open'] / df['close']
        df['price_range'] = (df['high'] - df['low']) / df['close']
        
        # Rolling statistics
        for window in [5, 10, 20]:
            df[f'rolling_mean_{window}'] = df['close'].rolling(window).mean()
            df[f'rolling_std_{window}'] = df['close'].rolling(window).std()
            df[f'rolling_min_{window}'] = df['close'].rolling(window).min()
            df[f'rolling_max_{window}'] = df['close'].rolling(window).max()
            df[f'price_position_{window}'] = (df['close'] - df[f'rolling_min_{window}']) / (df[f'rolling_max_{window}'] - df[f'rolling_min_{window}'])
        
        # Volatility features
        df['volatility_5'] = df['returns'].rolling(5).std()
        df['volatility_10'] = df['returns'].rolling(10).std()
        df['volatility_20'] = df['returns'].rolling(20).std()
        df['volatility_ratio'] = df['volatility_5'] / df['volatility_20']
        
        # Volume features
        df['volume_ratio'] = df['volume'] / df['volume'].rolling(20).mean()
        df['price_volume'] = df['close'] * df['volume']
        
        # Time features
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
        
        # Market session indicators (UTC time)
        df['asian_session'] = ((df['hour'] >= 0) & (df['hour'] < 8)).astype(int)
        df['london_session'] = ((df['hour'] >= 8) & (df['hour'] < 16)).astype(int)
        df['ny_session'] = ((df['hour'] >= 13) & (df['hour'] < 21)).astype(int)  # Adjusted for crypto
        
        # Handle missing values
        df = df.ffill().bfill()
        df = df.replace([np.inf, -np.inf], np.nan)
        
        # Drop rows with remaining NaN values
        initial_len = len(df)
        df = df.dropna()
        final_len = len(df)
        
        if initial_len != final_len:
            logger.info(f"Dropped {initial_len - final_len} rows with NaN values")
        
        logger.info(f"Added technical indicators. Final shape: {df.shape}")
        
        return df
    
    def collect_and_process(self, symbol='ETH/USDT', timeframe='5m', days=30, save=True):
        """Complete data collection and processing pipeline"""
        
        logger.info("🚀 Starting real data collection from Binance...")
        
        # Fetch raw data
        raw_data = self.fetch_historical_data(symbol, timeframe, days)
        
        if raw_data.empty:
            raise ValueError("No data collected from Binance")
        
        # Add technical indicators
        processed_data = self.add_technical_indicators(raw_data)
        
        if save:
            # Create data directory
            Path('data').mkdir(exist_ok=True)
            
            # Save processed data
            filepath = f'data/real_eth_data_{timeframe}_{days}d.csv'
            processed_data.to_csv(filepath)
            logger.info(f"💾 Real data saved to {filepath}")
            
            # Also save as the main processed data file
            processed_data.to_csv('data/processed_market_data.csv')
            logger.info("💾 Data saved as main processed_market_data.csv")
        
        # Print summary
        logger.info(f"\n📊 Real ETH Data Summary:")
        logger.info(f"Symbol: {symbol}")
        logger.info(f"Timeframe: {timeframe}")
        logger.info(f"Period: {days} days")
        logger.info(f"Records: {len(processed_data):,}")
        logger.info(f"Date range: {processed_data.index[0]} to {processed_data.index[-1]}")
        logger.info(f"Price range: ${processed_data['close'].min():.2f} to ${processed_data['close'].max():.2f}")
        logger.info(f"Features: {len(processed_data.columns)} columns")
        
        return processed_data

def main():
    """Main function to collect real data"""
    
    collector = RealDataCollector()
    
    try:
        # Collect 30 days of 5-minute ETH/USDT data
        data = collector.collect_and_process(
            symbol='ETH/USDT',
            timeframe='5m', 
            days=30,
            save=True
        )
        
        print(f"\n✅ Successfully collected {len(data):,} records of real ETH data!")
        print(f"📈 Ready for training with real market conditions!")
        
        return data
        
    except Exception as e:
        logger.error(f"❌ Data collection failed: {e}")
        return None

if __name__ == "__main__":
    main()
