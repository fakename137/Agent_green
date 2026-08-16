<div align="center">

# Agent Green

**Autonomous Solana memecoin trading, where every position comes with the reasoning that produced it.**

[![Mastra](https://img.shields.io/badge/Mastra-agent%20orchestration-000000?style=for-the-badge)](https://mastra.ai)
[![LIT Protocol](https://img.shields.io/badge/Vincent-LIT%20Protocol-FF6B35?style=for-the-badge)](https://litprotocol.com)
[![Solana](https://img.shields.io/badge/Solana-9945FF?style=for-the-badge&logo=solana&logoColor=white)](https://solana.com)
[![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)

</div>

---

## What this is

A trading system for Solana memecoins that reads on-chain analytics and social sentiment,
scores tokens with an LLM, sizes positions against explicit risk limits, and writes down
why it did each thing.

The memecoin market has two properties that make it a good test case for agents. It moves
faster than a person can research, and it is full of tokens designed to look like the ones
worth buying. Both are filtering problems, which is what the agent layer is for. The part
that mattered most in practice was not the scoring. It was making sure a model that had
been talked into something could not empty a wallet.

## How it is put together

**Mastra** orchestrates the agents, tools and workflows. Three agents (`memesolAgent`,
`tradingAgent`, `recallAgent`) run inside two workflows (`memesolWorkflow`,
`tradingWorkflow`), with data aggregation and analytics exposed to them as tools. Adding a
new data source or strategy means adding a tool, not rewriting the loop.

**A Gaianet node running Llama-3 on Groq** does the scoring, risk categorisation and
recommendations. It speaks an OpenAI-compatible API, so the model is swappable.

**Vincent, built on LIT Protocol,** executes trades under a session model rather than a
raw key. Spending limits, whitelists, blacklists and an emergency stop all live at that
layer, which means the constraints are enforced outside the agent that might want to
violate them. That separation is the whole safety argument: the model proposes, the
session decides what it is permitted to do.

**A Next.js dashboard and an Express backend** run the workflows and show what happened —
positions, reasoning, and the state of the risk controls.

## Backtesting

`Backtesting/` holds historical five-minute interval data for BTC and ETH, engineered
feature sets as CSV and JSON, and stored results, so strategy changes can be checked
against recorded history instead of only against a live market.

## Stack

| | |
|---|---|
| Orchestration | Mastra Core (agents, tools, workflows) |
| Inference | Gaianet node, Llama-3 via Groq, OpenAI-compatible API |
| Execution and custody | Vincent (LIT Protocol), session-based with spending policy |
| Chain | Solana |
| Dashboard | Next.js, TypeScript |
| API | Express |
| Tooling | MCP client (`src/mastra/mcp.ts`) |
| Analysis | Historical backtests over 5m BTC/ETH data |

## Running it

```bash
npm install

# workflow runner
npx tsx run-memesol-workflow.ts

# backend API
cd backend && npx tsx server.ts

# dashboard
cd dashboard && npm run dev
```

Configure LLM endpoint, Vincent session credentials and RPC access before running. See
`PRODUCTION_SETUP.md` for the deployment path and `TRADING_LOGIC.md` for how scoring and
position sizing actually work.

## Layout

```
src/mastra/
  agents/      memesolAgent, tradingAgent, recallAgent
  workflows/   memesolWorkflow, tradingWorkflow
  tools/       data aggregation, analytics, trade execution
  mcp.ts       MCP client
backend/       Express server, workflow execution
dashboard/     Next.js investor dashboard, Vincent integration
Backtesting/   historical data, features, results
```

## Status

A working system, built during a hackathon and run against live data. It is not audited
and it is not investment advice. Memecoin trading loses money routinely, and an agent
doing it automatically loses money faster. Read `TRADING_LOGIC.md` before pointing it at
anything you care about.
