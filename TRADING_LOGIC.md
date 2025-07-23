# 🚀 MemeSol Trading Logic

## Core Trading Strategy

### **Base Currency: Solana (SOL)**
- All trades use SOL as the base currency
- SOL Token Address: `So11111111111111111111111111111111111111112`

## Trading Flow

### **1. 💰 BUYING (SOL → Memecoin)**
```
SOL → Selected Memecoin
```
- **Trigger**: High-scoring memecoins from analysis
- **Amount**: Risk-based allocation
  - Low Risk: $300 USD worth
  - Moderate Risk: $150 USD worth  
  - High Risk: $100 USD worth
- **Slippage**: 1% for buying
- **Selection**: Top 3 tokens per risk category

### **2. 📈 HOLDING & MONITORING**
- Monitor portfolio balances
- Track profit/loss for each position
- Wait for profit-taking opportunities

### **3. 💸 SELLING (Memecoin → SOL)**
```
Memecoin → SOL (Taking Profits)
```
- **Trigger**: 1.5x profit target reached
- **Process**: Sell entire memecoin position back to SOL
- **Slippage**: 2% for selling (higher due to memecoin volatility)
- **Logic**: If current value ≥ 1.5x initial investment

## Configuration

```typescript
const TRADING_CONFIG = {
  BASE_CURRENCY: 'So11111111111111111111111111111111111111112', // SOL
  PROFIT_MULTIPLIER: 1.5, // Take profit at 1.5x (50% gain)
  SLIPPAGE_BUY: '1',      // 1% slippage for buying
  SLIPPAGE_SELL: '2',     // 2% slippage for selling
  INVESTMENT_AMOUNTS: {
    LOW_RISK: 300,         // $300 for low risk tokens
    MODERATE_RISK: 150,    // $150 for moderate risk tokens  
    HIGH_RISK: 100,        // $100 for high risk tokens
  }
};
```

## Trading Examples

### **Buying Example**
```
BUY: $300 USD worth of PEPE (Score: 75)
SOL → PEPE
Amount: $300 worth of SOL
Slippage: 1%
```

### **Selling Example**
```
SELL: Take profit on PEPE at 1.5x
PEPE → SOL  
Trigger: Position value ≥ $450 (1.5x of $300)
Slippage: 2%
```

## Risk Management

### **Position Sizing**
- Maximum 3 tokens per risk category
- Total allocation: $550 per cycle (if all categories filled)
- Diversified across risk levels

### **Profit Taking**
- **Target**: 50% minimum gain (1.5x)
- **Strategy**: Sell entire position when target hit
- **Reinvestment**: Profits return to SOL for next cycle

### **Portfolio Balance**
- **Initial**: 100% SOL
- **During Trades**: Mixed SOL + Memecoins
- **After Profits**: Back to 100% SOL (with gains)

## Workflow Steps

1. **Analysis**: Score and categorize memecoins
2. **Selection**: Pick top 3 per risk category
3. **Buying**: SOL → Memecoins (risk-based amounts)
4. **Monitoring**: Track positions and performance
5. **Profit-Taking**: Memecoins → SOL (when 1.5x reached)
6. **Repeat**: New cycle with updated SOL balance

## Success Metrics

- **Win Rate**: % of profitable trades
- **Average Return**: Mean profit per successful trade
- **SOL Growth**: Overall SOL balance increase
- **Risk-Adjusted Returns**: Profit vs risk category performance
