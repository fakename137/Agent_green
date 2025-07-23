###🦍 Agent Green (MemeSol) – Autonomous Memecoin Trading Platform

      <a href="https://ibb.co/dw7M52Bk"><img src="https://i.ibb.co/dw7M52Bk/Gemini-Generated-Image-9re0gv9re0gv9re0.png" alt="Gemini-Generated-Image-9re0gv9re0gv9re0" border="0"></a>


## Overview

**Agent Green** (MemeSol) is an AI-powered, fully autonomous trading platform for Solana memecoins. It combines advanced LLM agents, on-chain analytics, social sentiment, and risk management to discover, analyze, and trade trending memecoins—so you don’t have to ape in blindly!

- **For Investors:**  
  Get transparent, explainable, and risk-managed exposure to the wild world of memecoins.
- **For Developers:**  
  A modular, extensible codebase leveraging the latest in LLM, DeFi, and web3 tech.

---

## 🚀 What Problem Does This Solve?

- **Information Overload:**  
  The memecoin space moves fast—manual research is overwhelming and risky.
- **Rug Pulls & Scams:**  
  Most tools don’t filter out scams or provide explainable risk analysis.
- **Lack of Automation:**  
  No easy way to automate trading with real risk controls and social data.

**Agent Green** solves this by:

- Aggregating DEX, on-chain, and social data.
- Using LLMs to score and filter tokens.
- Automating trades with configurable risk/spending policies.
- Providing a beautiful dashboard for control and transparency.

---

## 🛠️ Key Technologies & Partners

### **Gaianet Node (Groq Llama-3)**

- **Role:** The “brain” of the agent—powers all token scoring, risk analysis, and recommendations.
- **How Used:**
  - All token scoring, risk categorization, and trading recommendations are powered by LLM prompts sent to the Gaianet node.
  - Used for both the `memesolAgent` and the `memesolWorkflow`, providing explainable, context-aware decisions.
  - Enables advanced prompt engineering for nuanced, real-time trading logic.
- **Integration:**
  - OpenAI-compatible API made integration seamless.
  - Fast, reliable, and perfect for real-time trading scenarios.
- **Feedback:**
  - Would love to see more advanced prompt engineering examples and multi-turn conversation support.

### **HeyVincent (LIT Protocol)**

- **Role:** Handles secure, session-based trade execution and wallet management.
- **How Used:**
  - Manages user sessions, spending limits, and risk controls.
  - Executes trades securely via Vincent’s API, ensuring safety and compliance.
  - Enables features like emergency stops, whitelists, and blacklists for investor protection.
- **Integration:**
  - Session-based model fits perfectly with investor-centric approach.
  - SDK and API are well-documented and easy to use.
- **Feedback:**
  - Would appreciate more real-world code samples and troubleshooting tips for edge cases.

### **Mastra Core**

- **Role:** Orchestrates agents, tools, and workflows.
- **How Used:**
  - Provides the backbone for agent and workflow management.
  - Makes it easy to add new data sources, tools, or trading strategies.
  - Ensures modularity and extensibility throughout the codebase.
- **Integration:**
  - Well-typed, modular, and developer-friendly.
- **Feedback:**
  - Documentation is solid; more advanced workflow examples would be a plus.

### **Next.js + Express**

- **Role:** Modern frontend and backend for a seamless user experience.
- **How Used:**
  - Next.js powers the investor dashboard, providing a beautiful and interactive UI.
  - Express serves as the backend API, orchestrating workflow execution and trade management.
- **Integration:**
  - Clear separation of concerns between frontend and backend.
  - Easy to extend and customize for new features.
- **Feedback:**
  - The stack is robust and familiar to most web developers, making onboarding easy.

---

## 📁 File Structure

Here’s a high-level breakdown of the project structure:

```
.
├── backend/                  # Express server for workflow execution
│   └── server.ts
├── dashboard/                # Next.js frontend (investor dashboard)
│   ├── src/
│   │   ├── app/
│   │   │   ├── investor/     # Investor dashboard UI
│   │   │   ├── api/          # API endpoints (run workflow, Vincent integration)
│   │   │   └── ...           # Auth, layout, etc.
│   │   ├── vincent/          # Vincent/LIT integration utilities
│   │   ├── backend/          # Custom backend tools for dashboard
│   │   └── types/            # Shared types/interfaces
│   ├── public/               # Static assets (SVGs, icons)
│   └── ...                   # Config, docs, etc.
├── src/
│   ├── mastra/
│   │   ├── agents/           # LLM agents (memesolAgent, tradingAgent, recallAgent)
│   │   ├── workflows/        # Workflows (memesolWorkflow, tradingWorkflow)
│   │   ├── tools/            # Data aggregation, analytics, and trading tools
│   │   ├── config/           # (Reserved for config files)
│   │   ├── utils/            # (Reserved for utility files)
│   │   └── index.ts, mcp.ts  # Entrypoints and MCP client
│   └── mlService.ts          # (Optional: ML utilities)
├── Backtesting/              # Historical data and backtesting utilities
│   ├── features_json/        # Feature CSVs and JSONs for BTC/ETH
│   ├── H_DATA/               # 5m interval historical data
│   └── results/              # Backtest results
├── workflow-results/         # Workflow execution logs/results
├── TRADING_LOGIC.md          # Trading logic documentation
├── PRODUCTION_SETUP.md       # Production deployment guide
├── package.json, tsconfig.json, etc.
└── ...
```

---

## 🧠 How It Works (End-to-End)

1. **User visits the dashboard** and configures an investment session (risk, spending, etc.).
2. **Dashboard triggers the backend** to run the memesolWorkflow.
3. **Workflow aggregates data** from DEX analytics, social media, and safety tools.
4. **LLM agent (Gaianet Node)** scores and categorizes tokens by risk.
5. **Safe tokens are selected** and, if enabled, trades are executed via Vincent/LIT.
6. **Results and performance** are displayed in the dashboard for transparency.

---

## 🏗️ Key Directories & Files

### **Backend**

- `backend/server.ts` – Express server, runs workflows and exposes API.

### **Dashboard (Frontend)**

- `dashboard/src/app/investor/page.tsx` – Main investor dashboard UI.
- `dashboard/src/app/api/run-memesol-vincent/route.ts` – Triggers memesol workflow and Vincent trades.
- `dashboard/src/vincent/` – Vincent/LIT wallet and trade integration.

### **Core Logic (Mastra)**

- `src/mastra/agents/` – LLM agents (memesolAgent, tradingAgent, recallAgent).
- `src/mastra/workflows/` – Workflows for token analysis and trading.
- `src/mastra/tools/` – Data aggregation, analytics, and trading tools.

### **Backtesting**

- `Backtesting/features_json/` – Feature data for BTC/ETH.
- `Backtesting/H_DATA/` – Historical price data.
- `Backtesting/results/` – Backtest results.

---

## 📚 Documentation & Developer Experience

- **Gaianet Node:**
  - Well-documented, easy OpenAI-compatible API.
  - Fast, reliable—great for real-time LLM use cases.
- **HeyVincent (LIT):**
  - Clear docs, session-based model fits perfectly.
  - Would love more real-world code samples, but overall excellent.
- **Mastra Core:**
  - Modular, extensible, and well-typed.
  - Easy to add new agents, tools, or workflows.

**Overall:**  
The codebase is well-structured and documented, with clear separation of concerns and plenty of comments/examples. New contributors can get up to speed quickly!

---

## ⚠️ Limitations

- **Solana-only:**  
  Currently focused on Solana memecoins; multi-chain support is a future goal.
- **LLM Hallucinations:**  
  Always use fallback logic and human review for large trades.
- **API Rate Limits:**  
  Heavy reliance on third-party APIs—watch for rate limits.
- **UI/UX:**  
  Functional and stylish, but more analytics and real-time updates could be added.

---

## 🌱 Future Prospects

- **Multi-chain support** (Ethereum, Base, etc.)
- **Deeper social analytics** (Discord, TikTok, etc.)
- **User-defined strategies** and notifications
- **Mobile app** for on-the-go investors
- **Community governance** and performance leaderboards

---

## 🏁 Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   cd dashboard && npm install
   ```
2. **Configure environment variables:**  
   See `PRODUCTION_SETUP.md` for details.
3. **Run the backend:**
   ```bash
   npm run server:dev
   ```
4. **Run the dashboard:**
   ```bash
   cd dashboard
   npm run dev
   ```
5. **Visit the dashboard:**  
   Open [http://localhost:3000/investor](http://localhost:3000/investor)

---

## 🤝 Contributing

Pull requests, issues, and feedback are welcome!  
See the code, read the docs, and help us build the future of autonomous trading.

---

**Agent Green is here to help you trade smarter, safer, and with more confidence in the memecoin jungle.**  
_Happy aping!_ 🚀🦍
