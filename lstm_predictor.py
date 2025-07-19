"""
LSTM-based price prediction model for ETH trading
"""
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler, RobustScaler
from sklearn.model_selection import train_test_split
import matplotlib.pyplot as plt
import seaborn as sns
from typing import Tuple, Optional, Dict, List
import logging
from pathlib import Path
import joblib
from tqdm import tqdm
import time
from datetime import timedelta
from config import config

logging.basicConfig(level=getattr(logging, config.log_level))
logger = logging.getLogger(__name__)

class PriceDataset(Dataset):
    """Dataset for LSTM price prediction"""
    
    def __init__(self, sequences: np.ndarray, targets: np.ndarray):
        self.sequences = torch.FloatTensor(sequences)
        self.targets = torch.FloatTensor(targets)
        
    def __len__(self):
        return len(self.sequences)
    
    def __getitem__(self, idx):
        return self.sequences[idx], self.targets[idx]

class AttentionLSTM(nn.Module):
    """LSTM with attention mechanism for price prediction"""
    
    def __init__(self, 
                 input_size: int,
                 hidden_size: int = None,
                 num_layers: int = None,
                 dropout: float = None,
                 bidirectional: bool = None,
                 prediction_steps: int = None):
        super(AttentionLSTM, self).__init__()
        
        # Use config defaults if not specified
        self.hidden_size = hidden_size or config.lstm.hidden_size
        self.num_layers = num_layers or config.lstm.num_layers
        self.dropout = dropout or config.lstm.dropout
        self.bidirectional = bidirectional or config.lstm.bidirectional
        self.prediction_steps = prediction_steps or config.lstm.prediction_steps
        
        self.input_size = input_size
        
        # LSTM layers
        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=self.hidden_size,
            num_layers=self.num_layers,
            dropout=self.dropout if self.num_layers > 1 else 0,
            bidirectional=self.bidirectional,
            batch_first=True
        )
        
        # Attention mechanism
        lstm_output_size = self.hidden_size * (2 if self.bidirectional else 1)
        self.attention = nn.Sequential(
            nn.Linear(lstm_output_size, lstm_output_size // 2),
            nn.Tanh(),
            nn.Linear(lstm_output_size // 2, 1)
        )
        
        # Output layers
        self.fc_layers = nn.Sequential(
            nn.Linear(lstm_output_size, lstm_output_size // 2),
            nn.ReLU(),
            nn.Dropout(self.dropout),
            nn.Linear(lstm_output_size // 2, lstm_output_size // 4),
            nn.ReLU(),
            nn.Dropout(self.dropout),
            nn.Linear(lstm_output_size // 4, self.prediction_steps)
        )
        
        # Initialize weights
        self._init_weights()
    
    def _init_weights(self):
        """Initialize model weights"""
        for name, param in self.named_parameters():
            if 'weight' in name:
                if 'lstm' in name:
                    nn.init.xavier_uniform_(param)
                else:
                    nn.init.kaiming_normal_(param)
            elif 'bias' in name:
                nn.init.constant_(param, 0)
    
    def forward(self, x):
        batch_size, seq_len, _ = x.size()
        
        # LSTM forward pass
        lstm_out, _ = self.lstm(x)
        
        # Attention mechanism
        attention_weights = self.attention(lstm_out)
        attention_weights = torch.softmax(attention_weights, dim=1)
        
        # Apply attention
        context_vector = torch.sum(lstm_out * attention_weights, dim=1)
        
        # Final prediction
        output = self.fc_layers(context_vector)
        
        return output, attention_weights

class MultiTaskLSTM(nn.Module):
    """Multi-task LSTM for price, volatility, and direction prediction"""
    
    def __init__(self, input_size: int):
        super(MultiTaskLSTM, self).__init__()
        
        # Shared LSTM backbone
        self.backbone = AttentionLSTM(input_size)
        
        # Task-specific heads
        lstm_output_size = config.lstm.hidden_size * (2 if config.lstm.bidirectional else 1)
        
        # Price prediction head
        self.price_head = nn.Linear(lstm_output_size // 4, config.lstm.prediction_steps)
        
        # Volatility prediction head
        self.volatility_head = nn.Linear(lstm_output_size // 4, config.lstm.prediction_steps)
        
        # Direction classification head
        self.direction_head = nn.Sequential(
            nn.Linear(lstm_output_size // 4, 64),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(64, 3)  # up, down, sideways
        )
        
        # Confidence estimation head
        self.confidence_head = nn.Sequential(
            nn.Linear(lstm_output_size // 4, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
            nn.Sigmoid()
        )
    
    def forward(self, x):
        # Get backbone features
        backbone_out, attention_weights = self.backbone(x)
        
        # Extract features from backbone
        features = self.backbone.fc_layers[:-1](
            torch.sum(self.backbone.lstm(x)[0] * attention_weights, dim=1)
        )
        
        # Task-specific predictions
        price_pred = self.price_head(features)
        volatility_pred = self.volatility_head(features)
        direction_pred = self.direction_head(features)
        confidence = self.confidence_head(features)
        
        return {
            'price': price_pred,
            'volatility': volatility_pred,
            'direction': direction_pred,
            'confidence': confidence,
            'attention': attention_weights
        }

class LSTMPredictor:
    """Main LSTM predictor class"""
    
    def __init__(self, model_type: str = "attention"):
        self.model_type = model_type
        self.model = None
        self.scaler = None
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.training_history = {'train_loss': [], 'val_loss': []}
        
        # Create model directory
        self.model_dir = Path(config.save_dir) / "lstm"
        self.model_dir.mkdir(parents=True, exist_ok=True)
    
    def prepare_data(self, df: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        """Prepare data for LSTM training"""
        
        # Select features (exclude target and non-numeric columns)
        feature_cols = [col for col in df.columns if col not in ['close', 'exchange'] 
                       and df[col].dtype in ['float64', 'int64']]
        
        logger.info(f"Using {len(feature_cols)} features for LSTM")
        
        # Scale features
        self.scaler = RobustScaler()
        scaled_features = self.scaler.fit_transform(df[feature_cols])
        
        # Create sequences
        X, y = self._create_sequences(scaled_features, df['close'])
        
        return X, y
    
    def _create_sequences(self, features: np.ndarray, prices: pd.Series) -> Tuple[np.ndarray, np.ndarray]:
        """Create sequences for LSTM"""
        
        seq_len = config.lstm.sequence_length
        pred_steps = config.lstm.prediction_steps
        
        X, y = [], []
        
        for i in range(seq_len, len(features) - pred_steps):
            # Input sequence
            X.append(features[i-seq_len:i])
            
            # Target: future price changes
            current_price = prices.iloc[i]
            future_prices = prices.iloc[i+1:i+pred_steps+1]
            price_changes = (future_prices / current_price - 1).values
            y.append(price_changes)
        
        return np.array(X), np.array(y)
    
    def build_model(self, input_size: int) -> nn.Module:
        """Build LSTM model"""
        
        if self.model_type == "attention":
            model = AttentionLSTM(input_size)
        elif self.model_type == "multitask":
            model = MultiTaskLSTM(input_size)
        else:
            raise ValueError(f"Unknown model type: {self.model_type}")
        
        return model.to(self.device)
    
    def train(self, X: np.ndarray, y: np.ndarray, validation_split: float = 0.2):
        """Train the LSTM model"""
        
        # Split data
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=validation_split, shuffle=False
        )
        
        # Create datasets
        train_dataset = PriceDataset(X_train, y_train)
        val_dataset = PriceDataset(X_val, y_val)
        
        train_loader = DataLoader(
            train_dataset, 
            batch_size=config.lstm.batch_size, 
            shuffle=True
        )
        val_loader = DataLoader(
            val_dataset, 
            batch_size=config.lstm.batch_size, 
            shuffle=False
        )
        
        # Build model
        input_size = X.shape[2]
        self.model = self.build_model(input_size)
        
        # Loss and optimizer
        criterion = nn.MSELoss()
        optimizer = optim.AdamW(
            self.model.parameters(),
            lr=config.lstm.learning_rate,
            weight_decay=config.lstm.weight_decay
        )
        
        scheduler = optim.lr_scheduler.ReduceLROnPlateau(
            optimizer, mode='min', patience=config.lstm.patience//2, factor=0.5
        )
        
        # Training loop
        best_val_loss = float('inf')
        patience_counter = 0
        
        logger.info(f"Starting LSTM training for {config.lstm.epochs} epochs...")
        logger.info(f"Training data: {len(train_dataset):,} samples, Validation data: {len(val_dataset):,} samples")
        
        # Training progress tracking
        start_time = time.time()
        
        # Create progress bar for epochs
        epoch_pbar = tqdm(range(config.lstm.epochs), desc="LSTM Training", 
                         unit="epoch", dynamic_ncols=True)
        
        for epoch in epoch_pbar:
            # Training phase
            self.model.train()
            train_loss = 0.0
            
            # Add progress bar for training batches
            train_batch_pbar = tqdm(train_loader, desc=f"Epoch {epoch+1} Training", 
                                  leave=False, unit="batch")
            
            for batch_X, batch_y in train_batch_pbar:
                batch_X, batch_y = batch_X.to(self.device), batch_y.to(self.device)
                
                optimizer.zero_grad()
                
                if self.model_type == "attention":
                    predictions, _ = self.model(batch_X)
                    loss = criterion(predictions, batch_y)
                else:  # multitask
                    outputs = self.model(batch_X)
                    loss = criterion(outputs['price'], batch_y)
                
                loss.backward()
                
                # Gradient clipping
                torch.nn.utils.clip_grad_norm_(
                    self.model.parameters(), 
                    config.lstm.gradient_clip
                )
                
                optimizer.step()
                train_loss += loss.item()
                
                # Update training batch progress
                train_batch_pbar.set_postfix({'Loss': f'{loss.item():.6f}'})
            
            # Validation phase
            self.model.eval()
            val_loss = 0.0
            
            with torch.no_grad():
                # Add progress bar for validation batches
                val_batch_pbar = tqdm(val_loader, desc=f"Epoch {epoch+1} Validation", 
                                    leave=False, unit="batch")
                
                for batch_X, batch_y in val_batch_pbar:
                    batch_X, batch_y = batch_X.to(self.device), batch_y.to(self.device)
                    
                    if self.model_type == "attention":
                        predictions, _ = self.model(batch_X)
                        loss = criterion(predictions, batch_y)
                    else:
                        outputs = self.model(batch_X)
                        loss = criterion(outputs['price'], batch_y)
                    
                    val_loss += loss.item()
                    
                    # Update validation batch progress
                    val_batch_pbar.set_postfix({'Loss': f'{loss.item():.6f}'})
            
            # Average losses
            train_loss /= len(train_loader)
            val_loss /= len(val_loader)
            
            # Update learning rate
            scheduler.step(val_loss)
            
            # Save training history
            self.training_history['train_loss'].append(train_loss)
            self.training_history['val_loss'].append(val_loss)
            
            # Early stopping
            if val_loss < best_val_loss:
                best_val_loss = val_loss
                patience_counter = 0
                self.save_model()
            else:
                patience_counter += 1
            
            # Update epoch progress bar
            elapsed_time = time.time() - start_time
            epoch_pbar.set_postfix({
                'Train Loss': f'{train_loss:.6f}',
                'Val Loss': f'{val_loss:.6f}',
                'Best Val': f'{best_val_loss:.6f}',
                'Patience': f'{patience_counter}/{config.lstm.patience}',
                'Time': f'{elapsed_time:.0f}s'
            })
            
            if patience_counter >= config.lstm.patience:
                epoch_pbar.set_description(f"LSTM Training (Early Stop)")
                logger.info(f"Early stopping at epoch {epoch}")
                break
            
            if epoch % 10 == 0:
                logger.info(f"Epoch {epoch}: Train Loss: {train_loss:.6f}, Val Loss: {val_loss:.6f}")
        
        # Close progress bar
        epoch_pbar.close()
        
        total_time = time.time() - start_time
        logger.info(f"LSTM training completed in {str(timedelta(seconds=int(total_time)))}")
        logger.info(f"Best validation loss: {best_val_loss:.6f}")
    
    def predict(self, X: np.ndarray) -> np.ndarray:
        """Make predictions with the trained model"""
        
        if self.model is None:
            raise ValueError("Model not trained or loaded")
        
        self.model.eval()
        
        with torch.no_grad():
            X_tensor = torch.FloatTensor(X).to(self.device)
            
            if self.model_type == "attention":
                predictions, attention = self.model(X_tensor)
                return predictions.cpu().numpy(), attention.cpu().numpy()
            else:
                outputs = self.model(X_tensor)
                return outputs['price'].cpu().numpy(), outputs
    
    def save_model(self):
        """Save the trained model and scaler"""
        
        model_path = self.model_dir / f"lstm_{self.model_type}.pth"
        scaler_path = self.model_dir / f"scaler_{self.model_type}.pkl"
        
        torch.save({
            'model_state_dict': self.model.state_dict(),
            'model_type': self.model_type,
            'config': config.lstm.__dict__,
            'training_history': self.training_history
        }, model_path)
        
        joblib.dump(self.scaler, scaler_path)
        
        logger.info(f"Model saved to {model_path}")
    
    def load_model(self, model_path: str = None):
        """Load a trained model"""
        
        if model_path is None:
            model_path = self.model_dir / f"lstm_{self.model_type}.pth"
        
        checkpoint = torch.load(model_path, map_location=self.device, weights_only=False)
        
        # Rebuild model (need input size)
        # This is a limitation - we should save input_size in checkpoint
        logger.warning("Loading model requires rebuilding - input size needed")
        
        self.training_history = checkpoint['training_history']
        
        # Load scaler
        scaler_path = self.model_dir / f"scaler_{self.model_type}.pkl"
        self.scaler = joblib.load(scaler_path)
        
        logger.info(f"Model loaded from {model_path}")
    
    def plot_training_history(self):
        """Plot training history"""
        
        fig, ax = plt.subplots(figsize=(10, 6))
        
        ax.plot(self.training_history['train_loss'], label='Training Loss')
        ax.plot(self.training_history['val_loss'], label='Validation Loss')
        ax.set_xlabel('Epoch')
        ax.set_ylabel('Loss')
        ax.set_title('LSTM Training History')
        ax.legend()
        ax.grid(True)
        
        plt.tight_layout()
        plt.savefig(self.model_dir / 'training_history.png')
        plt.show()
    
    def evaluate_predictions(self, X: np.ndarray, y_true: np.ndarray) -> Dict:
        """Evaluate model predictions"""
        
        predictions, _ = self.predict(X)
        
        # Calculate metrics
        mse = np.mean((predictions - y_true) ** 2)
        mae = np.mean(np.abs(predictions - y_true))
        
        # Direction accuracy (for first prediction step)
        y_true_direction = np.sign(y_true[:, 0])
        pred_direction = np.sign(predictions[:, 0])
        direction_accuracy = np.mean(y_true_direction == pred_direction)
        
        return {
            'mse': mse,
            'mae': mae,
            'rmse': np.sqrt(mse),
            'direction_accuracy': direction_accuracy
        }

if __name__ == "__main__":
    # Example usage
    from data_collector import DataCollector
    import asyncio
    
    # Collect data
    collector = DataCollector()
    data = asyncio.run(collector.collect_data())
    
    # Train LSTM
    predictor = LSTMPredictor(model_type="attention")
    X, y = predictor.prepare_data(data)
    
    print(f"Data shape: X={X.shape}, y={y.shape}")
    
    predictor.train(X, y)
    predictor.plot_training_history()
    
    # Evaluate
    metrics = predictor.evaluate_predictions(X[-100:], y[-100:])
    print(f"Evaluation metrics: {metrics}")
