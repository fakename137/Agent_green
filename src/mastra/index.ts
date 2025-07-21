import { Mastra } from '@mastra/core';
import { tradingAgent } from './agents/trading-agent';
import { recallAgent } from './agents/recall-agent';
import { tradingWorkflow } from './workflows/trading-workflow';
import { mcp } from './mcp';

// Initialize MCP client
console.log('🔧 Initializing MCP Client...');
try {
  // You can add MCP initialization logic here if needed
  console.log('✅ MCP Client ready');
} catch (error) {
  console.warn('⚠️ MCP Client not available - some features may be limited');
}

export const mastra = new Mastra({
  workflows: { tradingWorkflow },
  agents: { tradingAgent, recallAgent },
});

// Export MCP client for use in other parts of the application
export { mcp };
