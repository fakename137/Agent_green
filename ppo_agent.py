"""
PPO (Proximal Policy Optimization) agent for cryptocurrency trading
"""
import torch
import torch.nn as nn
import torch.optim as optim
import torch.nn.functional as F
from torch.distributions import Normal
import numpy as np
import pandas as pd
from collections import deque
import logging
from typing import Dict, List, Tuple, Optional, Any
from pathlib import Path
import matplotlib.pyplot as plt
import time
from datetime import datetime, timedelta
from tqdm import tqdm
# from stable_baselines3.common.vec_env import VecEnv  # Not needed
from config import config
from trading_environment import TradingEnvironment

logging.basicConfig(level=getattr(logging, config.log_level))
logger = logging.getLogger(__name__)

class PositionSizingNetwork(nn.Module):
    """Separate neural network for intelligent position sizing"""
    
    def __init__(self, input_dim: int, hidden_dims: List[int] = None):
        super(PositionSizingNetwork, self).__init__()
        
        if hidden_dims is None:
            hidden_dims = [128, 64, 32]
        
        layers = []
        prev_dim = input_dim
        
        for hidden_dim in hidden_dims:
            layers.extend([
                nn.Linear(prev_dim, hidden_dim),
                nn.ReLU(),
                nn.Dropout(0.2),
                nn.LayerNorm(hidden_dim)
            ])
            prev_dim = hidden_dim
        
        # Output layer for position size (5-25% of capital)
        layers.extend([
            nn.Linear(prev_dim, 1),
            nn.Sigmoid()  # Output 0-1, will be scaled to 5-25%
        ])
        
        self.network = nn.Sequential(*layers)
        self._init_weights()
    
    def _init_weights(self):
        """Initialize network weights"""
        for module in self.modules():
            if isinstance(module, nn.Linear):
                nn.init.orthogonal_(module.weight, 0.01)
                nn.init.constant_(module.bias, 0.0)
    
    def forward(self, state):
        """Forward pass to get position size"""
        raw_size = self.network(state)
        # Scale from 0-1 to 5-25% (0.05-0.25)
        position_size = 0.05 + 0.20 * raw_size
        return position_size

class ActorCriticNetwork(nn.Module):
    """Actor-Critic network with shared feature extraction"""
    
    def __init__(self, 
                 input_dim: int,
                 action_dim: int,
                 hidden_dims: List[int] = None):
        super(ActorCriticNetwork, self).__init__()
        
        if hidden_dims is None:
            hidden_dims = config.ppo.policy_layers
        
        self.input_dim = input_dim
        self.action_dim = action_dim
        
        # Shared feature extractor
        shared_layers = []
        prev_dim = input_dim
        
        for hidden_dim in hidden_dims[:-1]:
            shared_layers.extend([
                nn.Linear(prev_dim, hidden_dim),
                nn.ReLU(),
                nn.Dropout(0.3),
                nn.LayerNorm(hidden_dim)
            ])
            prev_dim = hidden_dim
        
        self.shared_net = nn.Sequential(*shared_layers)
        
        # Actor network (policy)
        self.actor_mean = nn.Sequential(
            nn.Linear(prev_dim, hidden_dims[-1]),
            nn.ReLU(),
            nn.Linear(hidden_dims[-1], action_dim),
            nn.Tanh()  # Actions are bounded
        )
        
        # Actor log_std (learnable parameter)
        self.actor_log_std = nn.Parameter(
            torch.zeros(action_dim) - 0.5  # Initial std around 0.6
        )
        
        # Critic network (value function)
        self.critic = nn.Sequential(
            nn.Linear(prev_dim, hidden_dims[-1]),
            nn.ReLU(),
            nn.Linear(hidden_dims[-1], hidden_dims[-1] // 2),
            nn.ReLU(),
            nn.Linear(hidden_dims[-1] // 2, 1)
        )
        
        # Initialize weights
        self._init_weights()
    
    def _init_weights(self):
        """Initialize network weights"""
        for module in self.modules():
            if isinstance(module, nn.Linear):
                nn.init.orthogonal_(module.weight, 0.01)
                nn.init.constant_(module.bias, 0.0)
    
    def forward(self, state):
        """Forward pass through the network"""
        features = self.shared_net(state)
        
        # Actor output
        action_mean = self.actor_mean(features)
        action_std = torch.exp(torch.clamp(self.actor_log_std, -20, 2))
        
        # Critic output
        value = self.critic(features)
        
        return action_mean, action_std, value
    
    def get_action_and_value(self, state, action=None):
        """Get action and value, optionally evaluate given action"""
        action_mean, action_std, value = self.forward(state)
        
        # Create distribution
        dist = Normal(action_mean, action_std)
        
        if action is None:
            action = dist.sample()
        
        # Calculate log probability and entropy
        log_prob = dist.log_prob(action).sum(axis=-1)
        entropy = dist.entropy().sum(axis=-1)
        
        return action, log_prob, entropy, value

class PPOBuffer:
    """Experience buffer for PPO"""
    
    def __init__(self, size: int, obs_dim: int, act_dim: int):
        self.max_size = size
        self.obs_dim = obs_dim
        self.act_dim = act_dim
        
        # Buffers
        self.observations = np.zeros((size, obs_dim), dtype=np.float32)
        self.actions = np.zeros((size, act_dim), dtype=np.float32)
        self.rewards = np.zeros(size, dtype=np.float32)
        self.values = np.zeros(size, dtype=np.float32)
        self.log_probs = np.zeros(size, dtype=np.float32)
        self.dones = np.zeros(size, dtype=np.bool_)
        
        # Pointers
        self.ptr = 0
        self.size = 0
    
    def store(self, obs, act, rew, val, log_prob, done):
        """Store experience"""
        assert self.ptr < self.max_size
        
        self.observations[self.ptr] = obs
        self.actions[self.ptr] = act
        self.rewards[self.ptr] = rew
        self.values[self.ptr] = val
        self.log_probs[self.ptr] = log_prob
        self.dones[self.ptr] = done
        
        self.ptr += 1
        self.size = min(self.size + 1, self.max_size)
    
    def get(self):
        """Get all stored experiences"""
        assert self.ptr == self.max_size
        
        # Calculate advantages and returns
        advantages, returns = self._compute_gae()
        
        # Normalize advantages
        advantages = (advantages - advantages.mean()) / (advantages.std() + 1e-8)
        
        data = {
            'observations': self.observations,
            'actions': self.actions,
            'advantages': advantages,
            'returns': returns,
            'log_probs': self.log_probs,
            'values': self.values
        }
        
        # Reset buffer
        self.ptr = 0
        self.size = 0
        
        return data
    
    def _compute_gae(self):
        """Compute Generalized Advantage Estimation"""
        advantages = np.zeros_like(self.rewards)
        returns = np.zeros_like(self.rewards)
        
        last_gae = 0
        last_return = 0
        
        for t in reversed(range(self.max_size)):
            if t == self.max_size - 1:
                next_value = 0  # Terminal state
                next_done = 1
            else:
                next_value = self.values[t + 1]
                next_done = self.dones[t + 1]
            
            # TD error
            delta = self.rewards[t] + config.ppo.gamma * next_value * (1 - next_done) - self.values[t]
            
            # GAE
            advantages[t] = delta + config.ppo.gamma * config.ppo.gae_lambda * (1 - next_done) * last_gae
            last_gae = advantages[t]
            
            # Returns
            returns[t] = self.rewards[t] + config.ppo.gamma * last_return * (1 - next_done)
            last_return = returns[t]
        
        return advantages, returns

class PPOAgent:
    """PPO agent for trading"""
    
    def __init__(self, 
                 observation_space,
                 action_space,
                 device: str = None):
        
        self.observation_space = observation_space
        self.action_space = action_space
        self.device = device or torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        # Network dimensions
        self.obs_dim = observation_space.shape[0]
        self.act_dim = action_space.shape[0]
        
        # Initialize networks
        self.network = ActorCriticNetwork(
            input_dim=self.obs_dim,
            action_dim=self.act_dim
        ).to(self.device)
        
        # Position sizing network (separate for intelligent capital allocation)
        self.position_network = PositionSizingNetwork(
            input_dim=self.obs_dim
        ).to(self.device)
        
        # Optimizers
        self.optimizer = optim.AdamW(
            self.network.parameters(),
            lr=config.ppo.learning_rate,
            eps=1e-5
        )
        
        self.position_optimizer = optim.AdamW(
            self.position_network.parameters(),
            lr=config.ppo.learning_rate * 0.5,  # Slower learning for position sizing
            eps=1e-5
        )
        
        # Learning rate scheduler
        self.scheduler = optim.lr_scheduler.StepLR(
            self.optimizer,
            step_size=1000,
            gamma=0.99
        )
        
        # Experience buffer
        self.buffer = PPOBuffer(
            size=config.ppo.n_steps,
            obs_dim=self.obs_dim,
            act_dim=self.act_dim
        )
        
        # Training statistics
        self.training_stats = {
            'policy_loss': [],
            'value_loss': [],
            'entropy_loss': [],
            'total_loss': [],
            'kl_divergence': [],
            'clip_fraction': []
        }
        
        # Model directory
        self.model_dir = Path(config.save_dir) / "ppo"
        self.model_dir.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"PPO agent initialized on {self.device}")
    
    def get_action(self, observation: np.ndarray, deterministic: bool = False) -> Tuple[np.ndarray, float, float]:
        """Get action from policy"""
        
        with torch.no_grad():
            obs_tensor = torch.FloatTensor(observation).unsqueeze(0).to(self.device)
            
            if deterministic:
                action_mean, _, value = self.network(obs_tensor)
                action = action_mean
                log_prob = torch.zeros(1)
            else:
                action, log_prob, _, value = self.network.get_action_and_value(obs_tensor)
            
            action = action.cpu().numpy()[0]
            log_prob = log_prob.cpu().numpy()[0] if not deterministic else 0.0
            value = value.cpu().numpy()[0][0]
        
        # Clip action to valid range
        action = np.clip(action, self.action_space.low, self.action_space.high)
        
        return action, log_prob, value
    
    def store_experience(self, obs, action, reward, value, log_prob, done):
        """Store experience in buffer"""
        self.buffer.store(obs, action, reward, value, log_prob, done)
    
    def update(self) -> Dict[str, float]:
        """Update policy using PPO"""
        
        # Get data from buffer
        data = self.buffer.get()
        
        # Convert to tensors
        observations = torch.FloatTensor(data['observations']).to(self.device)
        actions = torch.FloatTensor(data['actions']).to(self.device)
        advantages = torch.FloatTensor(data['advantages']).to(self.device)
        returns = torch.FloatTensor(data['returns']).to(self.device)
        old_log_probs = torch.FloatTensor(data['log_probs']).to(self.device)
        old_values = torch.FloatTensor(data['values']).to(self.device)
        
        # Training loop
        batch_size = config.ppo.batch_size
        indices = np.arange(config.ppo.n_steps)
        
        policy_losses = []
        value_losses = []
        entropy_losses = []
        kl_divs = []
        clip_fractions = []
        
        for epoch in range(config.ppo.n_epochs):
            np.random.shuffle(indices)
            
            for start in range(0, config.ppo.n_steps, batch_size):
                end = start + batch_size
                batch_indices = indices[start:end]
                
                # Get batch data
                batch_obs = observations[batch_indices]
                batch_actions = actions[batch_indices]
                batch_advantages = advantages[batch_indices]
                batch_returns = returns[batch_indices]
                batch_old_log_probs = old_log_probs[batch_indices]
                batch_old_values = old_values[batch_indices]
                
                # Forward pass
                _, new_log_probs, entropy, new_values = self.network.get_action_and_value(
                    batch_obs, batch_actions
                )
                
                # Policy loss (PPO clip objective)
                ratio = torch.exp(new_log_probs - batch_old_log_probs)
                clipped_ratio = torch.clamp(
                    ratio, 
                    1 - config.ppo.clip_range, 
                    1 + config.ppo.clip_range
                )
                
                policy_loss1 = -batch_advantages * ratio
                policy_loss2 = -batch_advantages * clipped_ratio
                policy_loss = torch.max(policy_loss1, policy_loss2).mean()
                
                # Value loss (clipped)
                if config.ppo.clip_range > 0:
                    value_pred_clipped = batch_old_values + torch.clamp(
                        new_values.squeeze() - batch_old_values,
                        -config.ppo.clip_range,
                        config.ppo.clip_range
                    )
                    value_loss1 = (new_values.squeeze() - batch_returns) ** 2
                    value_loss2 = (value_pred_clipped - batch_returns) ** 2
                    value_loss = torch.max(value_loss1, value_loss2).mean()
                else:
                    value_loss = ((new_values.squeeze() - batch_returns) ** 2).mean()
                
                # Entropy loss
                entropy_loss = -entropy.mean()
                
                # Total loss
                total_loss = (
                    policy_loss + 
                    config.ppo.vf_coef * value_loss + 
                    config.ppo.ent_coef * entropy_loss
                )
                
                # Backward pass
                self.optimizer.zero_grad()
                total_loss.backward()
                
                # Gradient clipping
                torch.nn.utils.clip_grad_norm_(
                    self.network.parameters(),
                    config.ppo.max_grad_norm
                )
                
                self.optimizer.step()
                
                # Statistics
                with torch.no_grad():
                    kl_div = ((batch_old_log_probs - new_log_probs) ** 2).mean()
                    clip_fraction = (torch.abs(ratio - 1) > config.ppo.clip_range).float().mean()
                    
                    policy_losses.append(policy_loss.item())
                    value_losses.append(value_loss.item())
                    entropy_losses.append(entropy_loss.item())
                    kl_divs.append(kl_div.item())
                    clip_fractions.append(clip_fraction.item())
                
                # Early stopping if KL divergence is too high
                if kl_div > 0.01:
                    logger.warning(f"High KL divergence: {kl_div:.6f}, stopping updates")
                    break
        
        # Update learning rate
        self.scheduler.step()
        
        # Store training statistics
        stats = {
            'policy_loss': np.mean(policy_losses),
            'value_loss': np.mean(value_losses),
            'entropy_loss': np.mean(entropy_losses),
            'total_loss': np.mean(policy_losses) + config.ppo.vf_coef * np.mean(value_losses) + config.ppo.ent_coef * np.mean(entropy_losses),
            'kl_divergence': np.mean(kl_divs),
            'clip_fraction': np.mean(clip_fractions),
            'learning_rate': self.optimizer.param_groups[0]['lr']
        }
        
        # Update training history
        for key, value in stats.items():
            if key in self.training_stats:
                self.training_stats[key].append(value)
        
        return stats
    
    def save_model(self, filename: str = None):
        """Save the model"""
        
        if filename is None:
            filename = "ppo_agent.pth"
        
        filepath = self.model_dir / filename
        
        torch.save({
            'network_state_dict': self.network.state_dict(),
            'optimizer_state_dict': self.optimizer.state_dict(),
            'training_stats': self.training_stats,
            'config': config.ppo.__dict__
        }, filepath)
        
        logger.info(f"Model saved to {filepath}")
    
    def load_model(self, filepath: str):
        """Load a saved model"""
        
        checkpoint = torch.load(filepath, map_location=self.device, weights_only=False)
        
        self.network.load_state_dict(checkpoint['network_state_dict'])
        self.optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
        self.training_stats = checkpoint['training_stats']
        
        logger.info(f"Model loaded from {filepath}")
    
    def plot_training_stats(self):
        """Plot training statistics"""
        
        fig, axes = plt.subplots(2, 3, figsize=(15, 10))
        axes = axes.flatten()
        
        metrics = ['policy_loss', 'value_loss', 'entropy_loss', 'kl_divergence', 'clip_fraction']
        
        for i, metric in enumerate(metrics):
            if metric in self.training_stats and len(self.training_stats[metric]) > 0:
                axes[i].plot(self.training_stats[metric])
                axes[i].set_title(f'{metric.replace("_", " ").title()}')
                axes[i].grid(True)
        
        # Plot total loss
        if len(self.training_stats['total_loss']) > 0:
            axes[5].plot(self.training_stats['total_loss'])
            axes[5].set_title('Total Loss')
            axes[5].grid(True)
        
        plt.tight_layout()
        plt.savefig(self.model_dir / 'training_stats.png')
        plt.show()

class PPOTrainer:
    """PPO training manager"""
    
    def __init__(self, env: TradingEnvironment, agent: PPOAgent):
        self.env = env
        self.agent = agent
        
        # Training statistics
        self.episode_rewards = []
        self.episode_lengths = []
        self.episode_stats = []
        
        # Best model tracking
        self.best_reward = -float('inf')
        self.best_sharpe = -float('inf')
    
    def train(self, total_timesteps: int):
        """Train the PPO agent"""
        
        logger.info(f"Starting PPO training for {total_timesteps:,} timesteps")
        
        observation, info = self.env.reset()
        episode_reward = 0
        episode_length = 0
        
        # Training progress tracking
        start_time = time.time()
        timesteps_done = 0
        
        # Create progress bar
        pbar = tqdm(total=total_timesteps, desc="Training PPO", 
                   unit="steps", dynamic_ncols=True)
        
        for timestep in range(total_timesteps):
            # Get action
            action, log_prob, value = self.agent.get_action(observation)
            
            # Take step
            next_observation, reward, terminated, truncated, info = self.env.step(action)
            done = terminated or truncated
            
            # Store experience
            self.agent.store_experience(
                observation, action, reward, value, log_prob, done
            )
            
            observation = next_observation
            episode_reward += reward
            episode_length += 1
            timesteps_done += 1
            
            # Update progress bar
            elapsed_time = time.time() - start_time
            if timesteps_done > 0:
                steps_per_sec = timesteps_done / elapsed_time
                eta_seconds = (total_timesteps - timesteps_done) / steps_per_sec if steps_per_sec > 0 else 0
                eta_str = str(timedelta(seconds=int(eta_seconds)))
                pbar.set_postfix({
                    'Steps/sec': f'{steps_per_sec:.1f}',
                    'ETA': eta_str,
                    'Ep_Reward': f'{episode_reward:.2f}'
                })
            pbar.update(1)
            
            # End of episode
            if done:
                # Log episode statistics
                episode_stats = self.env.get_episode_stats()
                self.episode_rewards.append(episode_reward)
                self.episode_lengths.append(episode_length)
                self.episode_stats.append(episode_stats)
                
                # Check for best model
                if episode_reward > self.best_reward:
                    self.best_reward = episode_reward
                    self.agent.save_model("best_reward_model.pth")
                
                if episode_stats['sharpe_ratio'] > self.best_sharpe:
                    self.best_sharpe = episode_stats['sharpe_ratio']
                    self.agent.save_model("best_sharpe_model.pth")
                
                # Log progress with time estimation
                if len(self.episode_rewards) % 10 == 0:
                    avg_reward = np.mean(self.episode_rewards[-10:])
                    avg_return = np.mean([s['total_return'] for s in self.episode_stats[-10:]])
                    avg_sharpe = np.mean([s['sharpe_ratio'] for s in self.episode_stats[-10:]])
                    
                    elapsed_time = time.time() - start_time
                    progress_pct = (timesteps_done / total_timesteps) * 100
                    
                    logger.info(
                        f"Episode {len(self.episode_rewards)} | "
                        f"Progress: {progress_pct:.1f}% | "
                        f"Avg Reward: {avg_reward:.4f} | "
                        f"Avg Return: {avg_return:.4f} | "
                        f"Avg Sharpe: {avg_sharpe:.4f} | "
                        f"Elapsed: {str(timedelta(seconds=int(elapsed_time)))}"
                    )
                
                # Reset environment
                observation, info = self.env.reset()
                episode_reward = 0
                episode_length = 0
            
            # Update agent
            if (timestep + 1) % config.ppo.n_steps == 0:
                update_stats = self.agent.update()
                
                if timestep % (config.ppo.n_steps * 10) == 0:
                    elapsed_time = time.time() - start_time
                    progress_pct = (timesteps_done / total_timesteps) * 100
                    logger.info(
                        f"Update {timestep // config.ppo.n_steps} | "
                        f"Progress: {progress_pct:.1f}% | "
                        f"Elapsed: {str(timedelta(seconds=int(elapsed_time)))} | "
                        f"Stats: {update_stats}"
                    )
        
        # Close progress bar
        pbar.close()
        
        total_time = time.time() - start_time
        logger.info(f"Training completed in {str(timedelta(seconds=int(total_time)))}")
        logger.info(f"Average steps per second: {total_timesteps / total_time:.2f}")
        
        # Save final model
        self.agent.save_model("final_model.pth")
        
        # Plot results
        self.plot_training_results()
    
    def plot_training_results(self):
        """Plot training results"""
        
        fig, axes = plt.subplots(2, 2, figsize=(12, 8))
        
        # Episode rewards
        axes[0, 0].plot(self.episode_rewards)
        axes[0, 0].set_title('Episode Rewards')
        axes[0, 0].set_xlabel('Episode')
        axes[0, 0].set_ylabel('Reward')
        axes[0, 0].grid(True)
        
        # Episode returns
        returns = [s['total_return'] for s in self.episode_stats]
        axes[0, 1].plot(returns)
        axes[0, 1].set_title('Episode Returns')
        axes[0, 1].set_xlabel('Episode')
        axes[0, 1].set_ylabel('Return')
        axes[0, 1].grid(True)
        
        # Sharpe ratio
        sharpe_ratios = [s['sharpe_ratio'] for s in self.episode_stats]
        axes[1, 0].plot(sharpe_ratios)
        axes[1, 0].set_title('Sharpe Ratio')
        axes[1, 0].set_xlabel('Episode')
        axes[1, 0].set_ylabel('Sharpe Ratio')
        axes[1, 0].grid(True)
        
        # Win rate
        win_rates = [s['win_rate'] for s in self.episode_stats]
        axes[1, 1].plot(win_rates)
        axes[1, 1].set_title('Win Rate')
        axes[1, 1].set_xlabel('Episode')
        axes[1, 1].set_ylabel('Win Rate')
        axes[1, 1].grid(True)
        
        plt.tight_layout()
        plt.savefig(self.agent.model_dir / 'training_results.png')
        plt.show()

if __name__ == "__main__":
    # Example usage
    from data_collector import DataCollector
    import asyncio
    
    # Collect data
    collector = DataCollector()
    data = asyncio.run(collector.collect_data())
    
    # Create environment and agent
    env = TradingEnvironment(data)
    agent = PPOAgent(env.observation_space, env.action_space)
    
    # Train agent
    trainer = PPOTrainer(env, agent)
    trainer.train(total_timesteps=100000)
    
    print("Training completed!")
