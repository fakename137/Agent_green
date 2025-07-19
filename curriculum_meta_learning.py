"""
Curriculum Learning and Meta-Learning for trading agent
"""
import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Optional, Any
import logging
from pathlib import Path
from dataclasses import dataclass
from enum import Enum
import copy
from collections import defaultdict, deque
from config import config
from trading_environment import TradingEnvironment
from ppo_agent import PPOAgent

logging.basicConfig(level=getattr(logging, config.log_level))
logger = logging.getLogger(__name__)

class DifficultyLevel(Enum):
    """Curriculum difficulty levels"""
    EASY = 0
    MEDIUM = 1
    HARD = 2
    EXPERT = 3

@dataclass
class CurriculumStage:
    """Curriculum learning stage"""
    name: str
    difficulty: DifficultyLevel
    market_conditions: Dict[str, Any]
    success_threshold: float
    min_episodes: int
    max_episodes: int
    current_episodes: int = 0
    success_rate: float = 0.0
    completed: bool = False

class MarketRegimeGenerator:
    """Generate different market regimes for curriculum learning"""
    
    def __init__(self):
        self.regime_generators = {
            'trending_up': self._generate_trending_up,
            'trending_down': self._generate_trending_down,
            'sideways': self._generate_sideways,
            'high_volatility': self._generate_high_volatility,
            'low_volatility': self._generate_low_volatility,
            'mean_reverting': self._generate_mean_reverting,
            'breakout': self._generate_breakout,
            'news_event': self._generate_news_event
        }
    
    def generate_regime_data(self, regime_type: str, base_data: pd.DataFrame, 
                           start_idx: int, length: int) -> pd.DataFrame:
        """Generate data for specific market regime"""
        
        if regime_type not in self.regime_generators:
            return base_data.iloc[start_idx:start_idx + length].copy()
        
        return self.regime_generators[regime_type](base_data, start_idx, length)
    
    def _generate_trending_up(self, data: pd.DataFrame, start_idx: int, length: int) -> pd.DataFrame:
        """Generate upward trending market"""
        segment = data.iloc[start_idx:start_idx + length].copy()
        
        # Add consistent upward bias
        trend_factor = np.linspace(1.0, 1.1, length)
        segment['close'] *= trend_factor
        segment['high'] *= trend_factor
        segment['low'] *= trend_factor
        segment['open'] *= trend_factor
        
        # Reduce volatility
        volatility_reduction = 0.7
        for col in ['open', 'high', 'low', 'close']:
            mean_price = segment[col].mean()
            segment[col] = mean_price + (segment[col] - mean_price) * volatility_reduction
        
        return segment
    
    def _generate_trending_down(self, data: pd.DataFrame, start_idx: int, length: int) -> pd.DataFrame:
        """Generate downward trending market"""
        segment = data.iloc[start_idx:start_idx + length].copy()
        
        # Add consistent downward bias
        trend_factor = np.linspace(1.0, 0.9, length)
        segment['close'] *= trend_factor
        segment['high'] *= trend_factor
        segment['low'] *= trend_factor
        segment['open'] *= trend_factor
        
        # Reduce volatility
        volatility_reduction = 0.7
        for col in ['open', 'high', 'low', 'close']:
            mean_price = segment[col].mean()
            segment[col] = mean_price + (segment[col] - mean_price) * volatility_reduction
        
        return segment
    
    def _generate_sideways(self, data: pd.DataFrame, start_idx: int, length: int) -> pd.DataFrame:
        """Generate sideways market"""
        segment = data.iloc[start_idx:start_idx + length].copy()
        
        # Remove trend
        mean_price = segment['close'].mean()
        for col in ['open', 'high', 'low', 'close']:
            segment[col] = mean_price + (segment[col] - segment[col].mean()) * 0.5
        
        return segment
    
    def _generate_high_volatility(self, data: pd.DataFrame, start_idx: int, length: int) -> pd.DataFrame:
        """Generate high volatility market"""
        segment = data.iloc[start_idx:start_idx + length].copy()
        
        # Increase volatility
        volatility_multiplier = 2.0
        for col in ['open', 'high', 'low', 'close']:
            mean_price = segment[col].mean()
            segment[col] = mean_price + (segment[col] - mean_price) * volatility_multiplier
        
        return segment
    
    def _generate_low_volatility(self, data: pd.DataFrame, start_idx: int, length: int) -> pd.DataFrame:
        """Generate low volatility market"""
        segment = data.iloc[start_idx:start_idx + length].copy()
        
        # Reduce volatility
        volatility_multiplier = 0.3
        for col in ['open', 'high', 'low', 'close']:
            mean_price = segment[col].mean()
            segment[col] = mean_price + (segment[col] - mean_price) * volatility_multiplier
        
        return segment
    
    def _generate_mean_reverting(self, data: pd.DataFrame, start_idx: int, length: int) -> pd.DataFrame:
        """Generate mean-reverting market"""
        segment = data.iloc[start_idx:start_idx + length].copy()
        
        # Apply mean reversion
        mean_price = segment['close'].mean()
        reversion_strength = 0.1
        
        for i in range(1, len(segment)):
            deviation = segment['close'].iloc[i] - mean_price
            segment['close'].iloc[i] -= deviation * reversion_strength
        
        return segment
    
    def _generate_breakout(self, data: pd.DataFrame, start_idx: int, length: int) -> pd.DataFrame:
        """Generate breakout market pattern"""
        segment = data.iloc[start_idx:start_idx + length].copy()
        
        # Create consolidation then breakout
        breakout_point = length // 2
        
        # Consolidation phase
        consolidation_range = 0.02  # 2% range
        mean_price = segment['close'].iloc[0]
        
        for i in range(breakout_point):
            segment['close'].iloc[i] = mean_price * (1 + np.random.uniform(-consolidation_range, consolidation_range))
        
        # Breakout phase
        breakout_direction = np.random.choice([-1, 1])
        breakout_magnitude = 0.05  # 5% move
        
        for i in range(breakout_point, length):
            progress = (i - breakout_point) / (length - breakout_point)
            segment['close'].iloc[i] = mean_price * (1 + breakout_direction * breakout_magnitude * progress)
        
        return segment
    
    def _generate_news_event(self, data: pd.DataFrame, start_idx: int, length: int) -> pd.DataFrame:
        """Generate market with news event"""
        segment = data.iloc[start_idx:start_idx + length].copy()
        
        # Random news event timing
        event_time = np.random.randint(length // 4, 3 * length // 4)
        event_magnitude = np.random.uniform(0.02, 0.08)  # 2-8% move
        event_direction = np.random.choice([-1, 1])
        
        # Apply sudden price movement
        for i in range(event_time, length):
            decay_factor = np.exp(-(i - event_time) * 0.1)  # Decay effect over time
            segment['close'].iloc[i] *= (1 + event_direction * event_magnitude * decay_factor)
        
        return segment

class CurriculumLearning:
    """Curriculum learning manager"""
    
    def __init__(self, base_data: pd.DataFrame):
        self.base_data = base_data
        self.regime_generator = MarketRegimeGenerator()
        self.stages = self._create_stages()
        self.current_stage_idx = 0
        self.stage_history = []
        
        logger.info(f"Curriculum learning initialized with {len(self.stages)} stages")
    
    def _create_stages(self) -> List[CurriculumStage]:
        """Create curriculum stages"""
        
        stages = [
            # Stage 1: Easy trending markets
            CurriculumStage(
                name="Easy Trending Up",
                difficulty=DifficultyLevel.EASY,
                market_conditions={'regime': 'trending_up', 'volatility': 'low'},
                success_threshold=0.7,
                min_episodes=50,
                max_episodes=200
            ),
            
            CurriculumStage(
                name="Easy Trending Down",
                difficulty=DifficultyLevel.EASY,
                market_conditions={'regime': 'trending_down', 'volatility': 'low'},
                success_threshold=0.7,
                min_episodes=50,
                max_episodes=200
            ),
            
            # Stage 2: Medium difficulty markets
            CurriculumStage(
                name="Sideways Markets",
                difficulty=DifficultyLevel.MEDIUM,
                market_conditions={'regime': 'sideways', 'volatility': 'medium'},
                success_threshold=0.6,
                min_episodes=75,
                max_episodes=300
            ),
            
            CurriculumStage(
                name="Medium Volatility",
                difficulty=DifficultyLevel.MEDIUM,
                market_conditions={'regime': 'mixed', 'volatility': 'medium'},
                success_threshold=0.6,
                min_episodes=75,
                max_episodes=300
            ),
            
            # Stage 3: Hard markets
            CurriculumStage(
                name="High Volatility",
                difficulty=DifficultyLevel.HARD,
                market_conditions={'regime': 'mixed', 'volatility': 'high'},
                success_threshold=0.5,
                min_episodes=100,
                max_episodes=400
            ),
            
            CurriculumStage(
                name="Mean Reverting",
                difficulty=DifficultyLevel.HARD,
                market_conditions={'regime': 'mean_reverting', 'volatility': 'medium'},
                success_threshold=0.5,
                min_episodes=100,
                max_episodes=400
            ),
            
            # Stage 4: Expert level
            CurriculumStage(
                name="News Events",
                difficulty=DifficultyLevel.EXPERT,
                market_conditions={'regime': 'news_event', 'volatility': 'high'},
                success_threshold=0.45,
                min_episodes=150,
                max_episodes=500
            ),
            
            CurriculumStage(
                name="Mixed Regimes",
                difficulty=DifficultyLevel.EXPERT,
                market_conditions={'regime': 'mixed', 'volatility': 'mixed'},
                success_threshold=0.45,
                min_episodes=150,
                max_episodes=500
            )
        ]
        
        return stages
    
    def get_current_stage(self) -> CurriculumStage:
        """Get current curriculum stage"""
        if self.current_stage_idx < len(self.stages):
            return self.stages[self.current_stage_idx]
        else:
            # Return last stage if curriculum completed
            return self.stages[-1]
    
    def should_advance_stage(self, recent_performance: List[Dict]) -> bool:
        """Check if should advance to next stage"""
        
        current_stage = self.get_current_stage()
        
        # Need minimum episodes
        if current_stage.current_episodes < current_stage.min_episodes:
            return False
        
        # Check performance criteria
        if len(recent_performance) < 10:  # Need enough data
            return False
        
        # Calculate success rate based on multiple metrics
        success_count = 0
        for perf in recent_performance[-20:]:  # Last 20 episodes
            # Success criteria: positive return, reasonable Sharpe ratio, not too many trades
            if (perf.get('total_return', 0) > 0 and 
                perf.get('sharpe_ratio', 0) > 0.5 and
                perf.get('max_drawdown', 1) < 0.15):
                success_count += 1
        
        success_rate = success_count / len(recent_performance[-20:])
        current_stage.success_rate = success_rate
        
        return success_rate >= current_stage.success_threshold
    
    def advance_stage(self):
        """Advance to next curriculum stage"""
        
        current_stage = self.get_current_stage()
        current_stage.completed = True
        
        self.stage_history.append({
            'stage_name': current_stage.name,
            'episodes_completed': current_stage.current_episodes,
            'success_rate': current_stage.success_rate,
            'difficulty': current_stage.difficulty
        })
        
        self.current_stage_idx += 1
        
        if self.current_stage_idx < len(self.stages):
            next_stage = self.get_current_stage()
            logger.info(f"Advanced to stage {self.current_stage_idx + 1}: {next_stage.name}")
        else:
            logger.info("Curriculum learning completed!")
    
    def generate_training_data(self, episode_length: int) -> pd.DataFrame:
        """Generate training data for current stage"""
        
        current_stage = self.get_current_stage()
        regime = current_stage.market_conditions.get('regime', 'mixed')
        
        # Select random starting point
        max_start = len(self.base_data) - episode_length - 100
        start_idx = np.random.randint(100, max_start)
        
        if regime == 'mixed':
            # Mix of different regimes
            regime_types = ['trending_up', 'trending_down', 'sideways', 'high_volatility']
            regime = np.random.choice(regime_types)
        
        # Generate regime-specific data
        episode_data = self.regime_generator.generate_regime_data(
            regime, self.base_data, start_idx, episode_length
        )
        
        current_stage.current_episodes += 1
        
        return episode_data

class MetaLearningAgent:
    """Meta-learning wrapper for PPO agent using MAML"""
    
    def __init__(self, base_agent: PPOAgent, tasks: List[str]):
        self.base_agent = base_agent
        self.tasks = tasks
        self.task_models = {}
        self.task_performance = defaultdict(list)
        self.adaptation_history = defaultdict(list)
        
        # Meta-learning parameters
        self.inner_lr = config.meta_learning.inner_lr
        self.meta_lr = config.meta_learning.meta_lr
        self.inner_steps = config.meta_learning.inner_steps
        self.meta_batch_size = config.meta_learning.meta_batch_size
        
        # Initialize task-specific models
        for task in tasks:
            self.task_models[task] = copy.deepcopy(base_agent.network)
        
        logger.info(f"Meta-learning agent initialized for tasks: {tasks}")
    
    def adapt_to_task(self, task: str, task_data: List[Tuple], 
                      adaptation_steps: int = None) -> Dict[str, float]:
        """Adapt agent to specific task using MAML"""
        
        if adaptation_steps is None:
            adaptation_steps = config.meta_learning.task_adaptation_steps
        
        if task not in self.task_models:
            self.task_models[task] = copy.deepcopy(self.base_agent.network)
        
        task_model = self.task_models[task]
        task_model.train()
        
        # Create optimizer for task adaptation
        task_optimizer = optim.SGD(task_model.parameters(), lr=self.inner_lr)
        
        adaptation_losses = []
        
        for step in range(adaptation_steps):
            # Sample batch from task data
            batch_size = min(32, len(task_data))
            batch_indices = np.random.choice(len(task_data), batch_size, replace=False)
            batch_data = [task_data[i] for i in batch_indices]
            
            # Calculate loss for this task
            total_loss = 0.0
            
            for obs, action, reward, next_obs, done in batch_data:
                obs_tensor = torch.FloatTensor(obs).unsqueeze(0)
                action_tensor = torch.FloatTensor(action).unsqueeze(0)
                
                # Get current policy output
                action_pred, log_prob, entropy, value = task_model.get_action_and_value(
                    obs_tensor, action_tensor
                )
                
                # Simple supervised loss (can be improved)
                action_loss = F.mse_loss(action_pred, action_tensor)
                total_loss += action_loss
            
            # Gradient step
            task_optimizer.zero_grad()
            total_loss.backward()
            task_optimizer.step()
            
            adaptation_losses.append(total_loss.item())
        
        # Store adaptation history
        self.adaptation_history[task].append({
            'adaptation_steps': adaptation_steps,
            'final_loss': adaptation_losses[-1] if adaptation_losses else 0,
            'loss_reduction': adaptation_losses[0] - adaptation_losses[-1] if len(adaptation_losses) > 1 else 0
        })
        
        return {
            'final_loss': adaptation_losses[-1] if adaptation_losses else 0,
            'adaptation_steps': adaptation_steps,
            'task': task
        }
    
    def meta_update(self, meta_batch: Dict[str, List[Tuple]]):
        """Perform meta-update using MAML"""
        
        meta_optimizer = optim.Adam(self.base_agent.network.parameters(), lr=self.meta_lr)
        
        total_meta_loss = 0.0
        
        for task, task_data in meta_batch.items():
            if len(task_data) < 10:  # Need sufficient data
                continue
            
            # Create temporary model copy for inner loop
            temp_model = copy.deepcopy(self.base_agent.network)
            temp_optimizer = optim.SGD(temp_model.parameters(), lr=self.inner_lr)
            
            # Inner loop adaptation
            for inner_step in range(self.inner_steps):
                # Sample support set
                support_size = min(16, len(task_data) // 2)
                support_data = np.random.choice(len(task_data), support_size, replace=False)
                
                support_loss = 0.0
                for idx in support_data:
                    obs, action, reward, next_obs, done = task_data[idx]
                    obs_tensor = torch.FloatTensor(obs).unsqueeze(0)
                    action_tensor = torch.FloatTensor(action).unsqueeze(0)
                    
                    action_pred, _, _, _ = temp_model.get_action_and_value(obs_tensor, action_tensor)
                    support_loss += F.mse_loss(action_pred, action_tensor)
                
                temp_optimizer.zero_grad()
                support_loss.backward()
                temp_optimizer.step()
            
            # Query set evaluation
            query_size = min(16, len(task_data) - len(support_data))
            query_indices = [i for i in range(len(task_data)) if i not in support_data]
            query_data = np.random.choice(query_indices, query_size, replace=False)
            
            query_loss = 0.0
            for idx in query_data:
                obs, action, reward, next_obs, done = task_data[idx]
                obs_tensor = torch.FloatTensor(obs).unsqueeze(0)
                action_tensor = torch.FloatTensor(action).unsqueeze(0)
                
                action_pred, _, _, _ = temp_model.get_action_and_value(obs_tensor, action_tensor)
                query_loss += F.mse_loss(action_pred, action_tensor)
            
            total_meta_loss += query_loss
        
        # Meta-gradient step
        meta_optimizer.zero_grad()
        total_meta_loss.backward()
        meta_optimizer.step()
        
        # Update task models
        for task in self.task_models:
            self.task_models[task].load_state_dict(self.base_agent.network.state_dict())
        
        return total_meta_loss.item()
    
    def get_task_performance(self, task: str) -> Dict[str, float]:
        """Get performance metrics for specific task"""
        
        if task not in self.task_performance:
            return {'avg_performance': 0.0, 'improvement': 0.0, 'episodes': 0}
        
        performances = self.task_performance[task]
        
        if len(performances) == 0:
            return {'avg_performance': 0.0, 'improvement': 0.0, 'episodes': 0}
        
        avg_performance = np.mean(performances[-10:])  # Last 10 episodes
        
        if len(performances) >= 20:
            recent_avg = np.mean(performances[-10:])
            earlier_avg = np.mean(performances[-20:-10])
            improvement = recent_avg - earlier_avg
        else:
            improvement = 0.0
        
        return {
            'avg_performance': avg_performance,
            'improvement': improvement,
            'episodes': len(performances)
        }
    
    def should_adapt(self, task: str, current_performance: float) -> bool:
        """Determine if adaptation is needed for task"""
        
        task_perf = self.get_task_performance(task)
        
        # Adapt if performance is declining or below threshold
        adaptation_threshold = config.meta_learning.adaptation_threshold
        
        if (task_perf['avg_performance'] > 0 and 
            current_performance < task_perf['avg_performance'] - adaptation_threshold):
            return True
        
        if current_performance < 0:  # Always adapt if losing money
            return True
        
        return False

class CurriculumMetaTrainer:
    """Combined curriculum learning and meta-learning trainer"""
    
    def __init__(self, base_data: pd.DataFrame, agent: PPOAgent):
        self.base_data = base_data
        self.agent = agent
        self.curriculum = CurriculumLearning(base_data)
        
        # Initialize meta-learning with task types
        meta_tasks = config.meta_learning.task_types
        self.meta_agent = MetaLearningAgent(agent, meta_tasks)
        
        # Training statistics
        self.training_history = {
            'curriculum_stages': [],
            'meta_learning_performance': defaultdict(list),
            'adaptation_events': []
        }
        
        logger.info("Curriculum + Meta-learning trainer initialized")
    
    def train_episode(self, task_type: str = None) -> Dict[str, Any]:
        """Train single episode with curriculum and meta-learning"""
        
        # Generate curriculum-appropriate data
        episode_data = self.curriculum.generate_training_data(
            config.environment.episode_length
        )
        
        # Create environment for this episode
        env = TradingEnvironment(episode_data)
        
        # Determine task type if not specified
        if task_type is None:
            current_stage = self.curriculum.get_current_stage()
            task_type = current_stage.market_conditions.get('regime', 'mixed')
        
        # Check if adaptation is needed
        recent_performance = self.meta_agent.get_task_performance(task_type)
        
        # Run episode
        obs, info = env.reset()
        episode_reward = 0
        episode_data_for_meta = []
        
        while True:
            # Get action (use task-specific model if available)
            if task_type in self.meta_agent.task_models:
                # Use adapted model
                with torch.no_grad():
                    obs_tensor = torch.FloatTensor(obs).unsqueeze(0)
                    action, log_prob, _, value = self.meta_agent.task_models[task_type].get_action_and_value(obs_tensor)
                    action = action.cpu().numpy()[0]
                    log_prob = log_prob.cpu().numpy()[0]
                    value = value.cpu().numpy()[0][0]
            else:
                # Use base agent
                action, log_prob, value = self.agent.get_action(obs)
            
            next_obs, reward, terminated, truncated, info = env.step(action)
            done = terminated or truncated
            
            # Store experience for meta-learning
            episode_data_for_meta.append((obs, action, reward, next_obs, done))
            
            # Store experience for base agent
            self.agent.store_experience(obs, action, reward, value, log_prob, done)
            
            obs = next_obs
            episode_reward += reward
            
            if done:
                break
        
        # Get episode statistics
        episode_stats = env.get_episode_stats()
        performance_score = episode_stats['total_return']
        
        # Update meta-learning
        self.meta_agent.task_performance[task_type].append(performance_score)
        
        # Check if adaptation is needed
        if self.meta_agent.should_adapt(task_type, performance_score):
            logger.info(f"Adapting to task: {task_type}")
            adaptation_result = self.meta_agent.adapt_to_task(task_type, episode_data_for_meta)
            self.training_history['adaptation_events'].append({
                'task_type': task_type,
                'episode': len(self.training_history['adaptation_events']),
                'adaptation_result': adaptation_result
            })
        
        # Update curriculum
        current_stage = self.curriculum.get_current_stage()
        stage_performance = [episode_stats]
        
        if self.curriculum.should_advance_stage(stage_performance):
            self.curriculum.advance_stage()
            self.training_history['curriculum_stages'].append({
                'stage_completed': current_stage.name,
                'episodes': current_stage.current_episodes,
                'success_rate': current_stage.success_rate
            })
        
        return {
            'episode_reward': episode_reward,
            'episode_stats': episode_stats,
            'task_type': task_type,
            'curriculum_stage': current_stage.name,
            'meta_performance': recent_performance
        }
    
    def train(self, total_episodes: int):
        """Main training loop"""
        
        logger.info(f"Starting curriculum + meta-learning training for {total_episodes} episodes")
        
        for episode in range(total_episodes):
            # Train episode
            episode_result = self.train_episode()
            
            # Update base agent periodically
            if (episode + 1) % config.ppo.n_steps == 0:
                update_stats = self.agent.update()
            
            # Meta-update periodically
            if (episode + 1) % (config.meta_learning.meta_batch_size * 10) == 0:
                # Collect meta-batch
                meta_batch = {}
                for task in self.meta_agent.tasks:
                    if task in self.meta_agent.task_performance:
                        # Generate task data (simplified)
                        task_data = []
                        for _ in range(50):  # Generate synthetic task data
                            episode_data = self.curriculum.generate_training_data(100)
                            # Process into meta-learning format
                            # This is simplified - in practice, would use actual experience
                        meta_batch[task] = task_data
                
                if meta_batch:
                    meta_loss = self.meta_agent.meta_update(meta_batch)
                    logger.info(f"Meta-update completed. Meta-loss: {meta_loss:.6f}")
            
            # Log progress
            if (episode + 1) % 50 == 0:
                current_stage = self.curriculum.get_current_stage()
                avg_reward = np.mean([r['episode_reward'] for r in [episode_result]])
                
                logger.info(
                    f"Episode {episode + 1}: "
                    f"Stage: {current_stage.name}, "
                    f"Reward: {episode_result['episode_reward']:.4f}, "
                    f"Return: {episode_result['episode_stats']['total_return']:.4f}"
                )
        
        logger.info("Curriculum + Meta-learning training completed")
    
    def save_training_history(self, filepath: str = None):
        """Save training history"""
        
        if filepath is None:
            filepath = Path(config.save_dir) / "curriculum_meta_history.pkl"
        
        import pickle
        with open(filepath, 'wb') as f:
            pickle.dump(self.training_history, f)
        
        logger.info(f"Training history saved to {filepath}")

if __name__ == "__main__":
    # Example usage
    from data_collector import DataCollector
    import asyncio
    
    # Collect data
    collector = DataCollector()
    data = asyncio.run(collector.collect_data())
    
    # Create agent and trainer
    env = TradingEnvironment(data)
    agent = PPOAgent(env.observation_space, env.action_space)
    
    # Create curriculum + meta-learning trainer
    trainer = CurriculumMetaTrainer(data, agent)
    
    # Train
    trainer.train(total_episodes=1000)
    trainer.save_training_history()
    
    print("Curriculum + Meta-learning training completed!")
