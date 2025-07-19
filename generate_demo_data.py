"""
Generate synthetic ETH trading data for demonstration
"""
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import ta

def generate_synthetic_eth_data(days=30, interval_minutes=5):
    """Generate synthetic ETH price data"""
    
    # Calculate number of periods
    periods = days * 24 * 60 // interval_minutes
    
    # Generate timestamps
    start_date = datetime.now() - timedelta(days=days)
    timestamps = [start_date + timedelta(minutes=i*interval_minutes) for i in range(periods)]
    
    # Generate price data with realistic movements
    np.random.seed(42)  # For reproducibility
    
    # Starting price around $2000
    initial_price = 2000.0
    
    # Generate returns with some volatility clustering
    volatility = 0.02  # 2% volatility
    returns = np.random.normal(0.0001, volatility, periods)  # Slight upward bias
    
    # Add some trending periods
    for i in range(0, periods, periods//10):
        trend_length = min(periods//20, periods - i)
        trend_direction = np.random.choice([-1, 1])
        trend_magnitude = np.random.uniform(0.0005, 0.002)
        returns[i:i+trend_length] += trend_direction * trend_magnitude
    
    # Generate prices
    prices = [initial_price]
    for ret in returns[1:]:
        new_price = prices[-1] * (1 + ret)
        prices.append(new_price)
    
    # Generate OHLCV data
    data = []
    for i, (timestamp, close_price) in enumerate(zip(timestamps, prices)):
        # Generate realistic OHLC from close price
        noise = np.random.uniform(0.995, 1.005)
        
        open_price = close_price * noise
        high_price = max(open_price, close_price) * np.random.uniform(1.0, 1.01)
        low_price = min(open_price, close_price) * np.random.uniform(0.99, 1.0)
        
        # Volume (roughly realistic for ETH)
        volume = np.random.lognormal(8, 1.5) * 1000  # Around 10M typical volume
        
        data.append({
            'timestamp': timestamp,
            'open': open_price,
            'high': high_price,
            'low': low_price,
            'close': close_price,
            'volume': volume
        })
    
    # Create DataFrame
    df = pd.DataFrame(data)
    df.set_index('timestamp', inplace=True)
    
    return df

def add_technical_indicators(df):
    """Add technical indicators to the data"""
    
    # Price-based indicators
    df['sma_20'] = ta.trend.sma_indicator(df['close'], window=20)
    df['ema_12'] = ta.trend.ema_indicator(df['close'], window=12)
    df['ema_26'] = ta.trend.ema_indicator(df['close'], window=26)
    
    # Momentum indicators
    df['rsi'] = ta.momentum.rsi(df['close'])
    df['stoch_k'] = ta.momentum.stoch(df['high'], df['low'], df['close'])
    df['stoch_d'] = ta.momentum.stoch_signal(df['high'], df['low'], df['close'])
    
    # MACD
    macd_line = ta.trend.MACD(df['close']).macd()
    macd_signal = ta.trend.MACD(df['close']).macd_signal()
    macd_histogram = ta.trend.MACD(df['close']).macd_diff()
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
    
    # Volatility
    df['atr'] = ta.volatility.average_true_range(df['high'], df['low'], df['close'])
    
    # Returns
    df['returns'] = df['close'].pct_change()
    df['log_returns'] = np.log(df['close'] / df['close'].shift(1))
    
    # Rolling statistics
    for window in [5, 10, 20]:
        df[f'rolling_mean_{window}'] = df['close'].rolling(window).mean()
        df[f'rolling_std_{window}'] = df['close'].rolling(window).std()
        df[f'rolling_min_{window}'] = df['close'].rolling(window).min()
        df[f'rolling_max_{window}'] = df['close'].rolling(window).max()
    
    # Volatility features
    df['volatility_5'] = df['returns'].rolling(5).std()
    df['volatility_20'] = df['returns'].rolling(20).std()
    
    # Volume features
    df['volume_sma'] = df['volume'].rolling(20).mean()
    df['volume_ratio'] = df['volume'] / df['volume_sma']
    
    # Time features
    df['hour'] = df.index.hour
    df['minute'] = df.index.minute
    df['day_of_week'] = df.index.dayofweek
    df['hour_sin'] = np.sin(2 * np.pi * df['hour'] / 24)
    df['hour_cos'] = np.cos(2 * np.pi * df['hour'] / 24)
    df['dow_sin'] = np.sin(2 * np.pi * df['day_of_week'] / 7)
    df['dow_cos'] = np.cos(2 * np.pi * df['day_of_week'] / 7)
    
    # Fill NaN values
    df = df.fillna(method='ffill').fillna(method='bfill')
    df = df.replace([np.inf, -np.inf], np.nan).dropna()
    
    return df

if __name__ == "__main__":
    # Generate demo data
    print("Generating synthetic ETH trading data...")
    
    # Generate 60 days of 5-minute data
    raw_data = generate_synthetic_eth_data(days=60, interval_minutes=5)
    print(f"Generated {len(raw_data)} raw data points")
    
    # Add technical indicators
    processed_data = add_technical_indicators(raw_data)
    print(f"Added technical indicators, final shape: {processed_data.shape}")
    
    # Create data directory
    import os
    os.makedirs('data', exist_ok=True)
    
    # Save data
    processed_data.to_csv('data/processed_market_data.csv')
    print("Demo data saved to data/processed_market_data.csv")
    
    # Print summary
    print(f"\nData Summary:")
    print(f"Date range: {processed_data.index[0]} to {processed_data.index[-1]}")
    print(f"Price range: ${processed_data['close'].min():.2f} to ${processed_data['close'].max():.2f}")
    print(f"Features: {len(processed_data.columns)} columns")
    
    print("\nFirst few rows:")
    print(processed_data[['open', 'high', 'low', 'close', 'volume']].head())
