"""
Trading Strategy Guidance System - 8 Proven Strategies
Provides optional guidance to PPO agent based on consensus signals
"""
import numpy as np
import pandas as pd
import ta
from typing import Dict, List, Tuple, Optional
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

@dataclass
class StrategySignal:
    """Individual strategy signal"""
    signal: float  # -1 (sell), 0 (hold), +1 (buy)
    confidence: float  # 0-1, confidence in the signal
    strategy_name: str

@dataclass
class StrategyConsensus:
    """Consensus from all strategies"""
    consensus_signal: float  # Average signal (-1 to +1)
    consensus_confidence: float  # Percentage of strategies agreeing (0-1)
    individual_signals: List[StrategySignal]
    agreement_count: int  # Number of strategies agreeing on direction

class TradingStrategies:
    """
    8 Proven Trading Strategies for PPO Agent Guidance
    Based on your friend's successful implementation
    """
    
    def __init__(self, lookback_window: int = 50):
        self.lookback_window = lookback_window
        self.strategies = [
            self.momentum_scalping,
            self.rsi_crossover,
            self.vwap_reversion,
            self.ema_crossover,
            self.macd_histogram_scalping,
            self.breakout_scalping,
            self.volume_spike_scalping,
            self.fibonacci_levels
        ]
        
    def get_strategy_signals(self, data: pd.DataFrame, current_idx: int) -> StrategyConsensus:
        """
        Get consensus signals from all 8 strategies
        
        Args:
            data: OHLCV data with technical indicators
            current_idx: Current position in the data
            
        Returns:
            StrategyConsensus with all strategy signals and consensus
        """
        if current_idx < self.lookback_window:
            # Not enough data for analysis
            return StrategyConsensus(0.0, 0.0, [], 0)
        
        # Get signals from all strategies
        signals = []
        for strategy_func in self.strategies:
            try:
                signal = strategy_func(data, current_idx)
                signals.append(signal)
            except Exception as e:
                logger.warning(f"Strategy {strategy_func.__name__} failed: {e}")
                signals.append(StrategySignal(0.0, 0.0, strategy_func.__name__))
        
        # Calculate consensus
        consensus = self._calculate_consensus(signals)
        return consensus
    
    def _calculate_consensus(self, signals: List[StrategySignal]) -> StrategyConsensus:
        """Calculate consensus from individual strategy signals"""
        if not signals:
            return StrategyConsensus(0.0, 0.0, [], 0)
        
        # Filter out zero-confidence signals
        valid_signals = [s for s in signals if s.confidence > 0.1]
        
        if not valid_signals:
            return StrategyConsensus(0.0, 0.0, signals, 0)
        
        # Weighted average signal (by confidence)
        total_weight = sum(s.confidence for s in valid_signals)
        if total_weight == 0:
            consensus_signal = 0.0
        else:
            consensus_signal = sum(s.signal * s.confidence for s in valid_signals) / total_weight
        
        # Calculate agreement (percentage of strategies agreeing on direction)
        if consensus_signal > 0.1:  # Bullish consensus
            agreeing_signals = [s for s in valid_signals if s.signal > 0.1]
        elif consensus_signal < -0.1:  # Bearish consensus
            agreeing_signals = [s for s in valid_signals if s.signal < -0.1]
        else:  # Neutral/no consensus
            agreeing_signals = [s for s in valid_signals if abs(s.signal) <= 0.1]
        
        agreement_count = len(agreeing_signals)
        consensus_confidence = agreement_count / len(valid_signals) if valid_signals else 0.0
        
        return StrategyConsensus(
            consensus_signal=consensus_signal,
            consensus_confidence=consensus_confidence,
            individual_signals=signals,
            agreement_count=agreement_count
        )
    
    def momentum_scalping(self, data: pd.DataFrame, current_idx: int) -> StrategySignal:
        """
        Strategy 1: Momentum Scalping
        Buy/sell signals based on short-term price momentum
        """
        try:
            # Use ROC (Rate of Change) for momentum
            if 'roc_5' not in data.columns:
                data['roc_5'] = ta.momentum.ROCIndicator(data['close'], window=5).roc()
            if 'roc_10' not in data.columns:
                data['roc_10'] = ta.momentum.ROCIndicator(data['close'], window=10).roc()
            
            roc_5 = data['roc_5'].iloc[current_idx]
            roc_10 = data['roc_10'].iloc[current_idx]
            
            # Strong momentum signals
            if roc_5 > 0.005 and roc_10 > 0.002:  # 0.5% and 0.2% thresholds
                signal = 1.0  # Strong buy
                confidence = min(abs(roc_5) * 100, 1.0)
            elif roc_5 < -0.005 and roc_10 < -0.002:
                signal = -1.0  # Strong sell
                confidence = min(abs(roc_5) * 100, 1.0)
            else:
                signal = 0.0  # Hold
                confidence = 0.0
            
            return StrategySignal(signal, confidence, "momentum_scalping")
            
        except Exception as e:
            logger.warning(f"Momentum scalping failed: {e}")
            return StrategySignal(0.0, 0.0, "momentum_scalping")
    
    def rsi_crossover(self, data: pd.DataFrame, current_idx: int) -> StrategySignal:
        """
        Strategy 2: RSI Crossover
        Oversold/overbought signals when RSI crosses 30/70 levels
        """
        try:
            if 'rsi' not in data.columns:
                data['rsi'] = ta.momentum.RSIIndicator(data['close'], window=14).rsi()
            
            current_rsi = data['rsi'].iloc[current_idx]
            prev_rsi = data['rsi'].iloc[current_idx - 1]
            
            # RSI crossover signals
            if prev_rsi <= 30 and current_rsi > 30:  # Oversold to normal
                signal = 1.0  # Buy
                confidence = (30 - min(prev_rsi, 30)) / 30  # Stronger if more oversold
            elif prev_rsi >= 70 and current_rsi < 70:  # Overbought to normal
                signal = -1.0  # Sell
                confidence = (max(prev_rsi, 70) - 70) / 30  # Stronger if more overbought
            elif current_rsi < 25:  # Extremely oversold
                signal = 1.0
                confidence = 0.8
            elif current_rsi > 75:  # Extremely overbought
                signal = -1.0
                confidence = 0.8
            else:
                signal = 0.0
                confidence = 0.0
            
            return StrategySignal(signal, confidence, "rsi_crossover")
            
        except Exception as e:
            logger.warning(f"RSI crossover failed: {e}")
            return StrategySignal(0.0, 0.0, "rsi_crossover")
    
    def vwap_reversion(self, data: pd.DataFrame, current_idx: int) -> StrategySignal:
        """
        Strategy 3: VWAP Reversion
        Mean reversion signals relative to Volume Weighted Average Price
        """
        try:
            if 'vwap' not in data.columns:
                data['vwap'] = ta.volume.VolumeSMAIndicator(
                    data['close'], data['volume'], window=20
                ).volume_sma()
            
            current_price = data['close'].iloc[current_idx]
            current_vwap = data['vwap'].iloc[current_idx]
            
            # Price deviation from VWAP
            deviation = (current_price - current_vwap) / current_vwap
            
            # Mean reversion signals
            if deviation < -0.01:  # Price 1% below VWAP
                signal = 1.0  # Buy (expect reversion up)
                confidence = min(abs(deviation) * 50, 1.0)
            elif deviation > 0.01:  # Price 1% above VWAP
                signal = -1.0  # Sell (expect reversion down)
                confidence = min(abs(deviation) * 50, 1.0)
            else:
                signal = 0.0
                confidence = 0.0
            
            return StrategySignal(signal, confidence, "vwap_reversion")
            
        except Exception as e:
            logger.warning(f"VWAP reversion failed: {e}")
            return StrategySignal(0.0, 0.0, "vwap_reversion")
    
    def ema_crossover(self, data: pd.DataFrame, current_idx: int) -> StrategySignal:
        """
        Strategy 4: EMA Crossover
        Golden cross/death cross signals from fast/slow EMA crossovers
        """
        try:
            if 'ema_12' not in data.columns:
                data['ema_12'] = ta.trend.EMAIndicator(data['close'], window=12).ema_indicator()
            if 'ema_26' not in data.columns:
                data['ema_26'] = ta.trend.EMAIndicator(data['close'], window=26).ema_indicator()
            
            current_fast = data['ema_12'].iloc[current_idx]
            current_slow = data['ema_26'].iloc[current_idx]
            prev_fast = data['ema_12'].iloc[current_idx - 1]
            prev_slow = data['ema_26'].iloc[current_idx - 1]
            
            # Crossover detection
            if prev_fast <= prev_slow and current_fast > current_slow:  # Golden cross
                signal = 1.0  # Buy
                confidence = 0.7
            elif prev_fast >= prev_slow and current_fast < current_slow:  # Death cross
                signal = -1.0  # Sell
                confidence = 0.7
            else:
                # Trend strength based on EMA separation
                separation = (current_fast - current_slow) / current_slow
                if separation > 0.002:  # Fast EMA 0.2% above slow
                    signal = 0.5  # Weak buy
                    confidence = 0.3
                elif separation < -0.002:  # Fast EMA 0.2% below slow
                    signal = -0.5  # Weak sell
                    confidence = 0.3
                else:
                    signal = 0.0
                    confidence = 0.0
            
            return StrategySignal(signal, confidence, "ema_crossover")
            
        except Exception as e:
            logger.warning(f"EMA crossover failed: {e}")
            return StrategySignal(0.0, 0.0, "ema_crossover")
    
    def macd_histogram_scalping(self, data: pd.DataFrame, current_idx: int) -> StrategySignal:
        """
        Strategy 5: MACD Histogram Scalping
        Momentum signals from MACD histogram changes
        """
        try:
            if 'macd_diff' not in data.columns:
                macd = ta.trend.MACD(data['close'])
                data['macd_diff'] = macd.macd_diff()
            
            current_hist = data['macd_diff'].iloc[current_idx]
            prev_hist = data['macd_diff'].iloc[current_idx - 1]
            
            # Histogram momentum signals
            if current_hist > 0 and prev_hist <= 0:  # Histogram turns positive
                signal = 1.0  # Buy
                confidence = 0.6
            elif current_hist < 0 and prev_hist >= 0:  # Histogram turns negative
                signal = -1.0  # Sell
                confidence = 0.6
            elif current_hist > prev_hist and current_hist > 0:  # Increasing positive histogram
                signal = 0.5  # Weak buy
                confidence = 0.3
            elif current_hist < prev_hist and current_hist < 0:  # Decreasing negative histogram
                signal = -0.5  # Weak sell
                confidence = 0.3
            else:
                signal = 0.0
                confidence = 0.0
            
            return StrategySignal(signal, confidence, "macd_histogram_scalping")
            
        except Exception as e:
            logger.warning(f"MACD histogram scalping failed: {e}")
            return StrategySignal(0.0, 0.0, "macd_histogram_scalping")
    
    def breakout_scalping(self, data: pd.DataFrame, current_idx: int) -> StrategySignal:
        """
        Strategy 6: Breakout Scalping
        Breakout signals when price breaks Bollinger Band levels
        """
        try:
            if 'bb_upper' not in data.columns:
                bb = ta.volatility.BollingerBands(data['close'], window=20, window_dev=2)
                data['bb_upper'] = bb.bollinger_hband()
                data['bb_lower'] = bb.bollinger_lband()
                data['bb_middle'] = bb.bollinger_mavg()
            
            current_price = data['close'].iloc[current_idx]
            prev_price = data['close'].iloc[current_idx - 1]
            bb_upper = data['bb_upper'].iloc[current_idx]
            bb_lower = data['bb_lower'].iloc[current_idx]
            bb_middle = data['bb_middle'].iloc[current_idx]
            
            # Breakout signals
            if prev_price <= bb_upper and current_price > bb_upper:  # Upper breakout
                signal = 1.0  # Buy
                confidence = 0.8
            elif prev_price >= bb_lower and current_price < bb_lower:  # Lower breakout
                signal = -1.0  # Sell
                confidence = 0.8
            elif current_price > bb_middle and prev_price <= bb_middle:  # Middle cross up
                signal = 0.5  # Weak buy
                confidence = 0.4
            elif current_price < bb_middle and prev_price >= bb_middle:  # Middle cross down
                signal = -0.5  # Weak sell
                confidence = 0.4
            else:
                signal = 0.0
                confidence = 0.0
            
            return StrategySignal(signal, confidence, "breakout_scalping")
            
        except Exception as e:
            logger.warning(f"Breakout scalping failed: {e}")
            return StrategySignal(0.0, 0.0, "breakout_scalping")
    
    def volume_spike_scalping(self, data: pd.DataFrame, current_idx: int) -> StrategySignal:
        """
        Strategy 7: Volume Spike Scalping
        Volume-based signals combined with price movement
        """
        try:
            if 'volume_sma' not in data.columns:
                data['volume_sma'] = data['volume'].rolling(window=20).mean()
            
            current_volume = data['volume'].iloc[current_idx]
            avg_volume = data['volume_sma'].iloc[current_idx]
            current_price = data['close'].iloc[current_idx]
            prev_price = data['close'].iloc[current_idx - 1]
            
            # Volume spike detection
            volume_ratio = current_volume / avg_volume if avg_volume > 0 else 1.0
            price_change = (current_price - prev_price) / prev_price
            
            # Volume spike + price movement signals
            if volume_ratio > 2.0 and price_change > 0.002:  # High volume + price up
                signal = 1.0  # Buy
                confidence = min(volume_ratio / 5.0, 1.0)
            elif volume_ratio > 2.0 and price_change < -0.002:  # High volume + price down
                signal = -1.0  # Sell
                confidence = min(volume_ratio / 5.0, 1.0)
            elif volume_ratio > 1.5 and abs(price_change) > 0.001:  # Medium volume + movement
                signal = 0.5 * np.sign(price_change)  # Weak signal in price direction
                confidence = 0.3
            else:
                signal = 0.0
                confidence = 0.0
            
            return StrategySignal(signal, confidence, "volume_spike_scalping")
            
        except Exception as e:
            logger.warning(f"Volume spike scalping failed: {e}")
            return StrategySignal(0.0, 0.0, "volume_spike_scalping")
    
    def fibonacci_levels(self, data: pd.DataFrame, current_idx: int) -> StrategySignal:
        """
        Strategy 8: Fibonacci Levels
        Dynamic support/resistance levels calculated from recent swing points
        """
        try:
            # Look back for swing high/low
            lookback = min(20, current_idx)
            recent_data = data.iloc[current_idx - lookback:current_idx + 1]
            
            swing_high = recent_data['high'].max()
            swing_low = recent_data['low'].min()
            current_price = data['close'].iloc[current_idx]
            
            # Calculate Fibonacci levels
            fib_range = swing_high - swing_low
            if fib_range == 0:
                return StrategySignal(0.0, 0.0, "fibonacci_levels")
            
            # Key Fibonacci retracement levels
            fib_236 = swing_high - 0.236 * fib_range  # 23.6% retracement
            fib_382 = swing_high - 0.382 * fib_range  # 38.2% retracement
            fib_618 = swing_high - 0.618 * fib_range  # 61.8% retracement
            
            # Signal based on proximity to Fibonacci levels
            tolerance = fib_range * 0.01  # 1% tolerance
            
            if abs(current_price - fib_618) < tolerance:  # Near 61.8% (strong support)
                signal = 1.0  # Buy
                confidence = 0.7
            elif abs(current_price - fib_382) < tolerance:  # Near 38.2% (medium support)
                signal = 0.5  # Weak buy
                confidence = 0.5
            elif abs(current_price - fib_236) < tolerance:  # Near 23.6% (weak support)
                signal = 0.3  # Very weak buy
                confidence = 0.3
            elif current_price < swing_low:  # Below swing low (breakdown)
                signal = -1.0  # Sell
                confidence = 0.6
            elif current_price > swing_high:  # Above swing high (breakout)
                signal = 1.0  # Buy
                confidence = 0.6
            else:
                signal = 0.0
                confidence = 0.0
            
            return StrategySignal(signal, confidence, "fibonacci_levels")
            
        except Exception as e:
            logger.warning(f"Fibonacci levels failed: {e}")
            return StrategySignal(0.0, 0.0, "fibonacci_levels")
    
    def get_strategy_features(self, data: pd.DataFrame, current_idx: int) -> Dict[str, float]:
        """
        Get strategy features for the PPO agent observation space
        
        Returns:
            Dictionary with strategy consensus and individual signals
        """
        consensus = self.get_strategy_signals(data, current_idx)
        
        features = {
            'strategy_consensus': consensus.consensus_signal,
            'strategy_confidence': consensus.consensus_confidence,
            'strategy_agreement_count': consensus.agreement_count / 8.0,  # Normalized
        }
        
        # Add individual strategy signals
        for i, signal in enumerate(consensus.individual_signals):
            features[f'strategy_{i}_signal'] = signal.signal
            features[f'strategy_{i}_confidence'] = signal.confidence
        
        # Pad if we have fewer than 8 strategies
        for i in range(len(consensus.individual_signals), 8):
            features[f'strategy_{i}_signal'] = 0.0
            features[f'strategy_{i}_confidence'] = 0.0
        
        return features
