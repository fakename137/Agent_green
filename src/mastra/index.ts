import { Mastra } from '@mastra/core';
import type { MCPContext } from '@mastra/mcp';
import { tradingAgent } from './agents/trading-agent';
import { recallAgent } from './agents/recall-agent';
import { tradingWorkflow } from './workflows/trading-workflow';
import { memesolAgent } from './agents/memesol-agent';
import { memesolWorkflow } from './workflows/memesol-workflow';
import { mcp } from './mcp';
import { registerApiRoute } from '@mastra/core/server';

// Initialize MCP client
console.log('🔧 Initializing MCP Client...');
try {
  // You can add MCP initialization logic here if needed
  console.log('✅ MCP Client ready');
} catch (error) {
  console.warn('⚠️ MCP Client not available - some features may be limited');
}

// Initialize Mastra with workflows and agents
export const mastra = new Mastra({
  workflows: {
    tradingWorkflow,
    memesolWorkflow,
  },
  agents: {
    tradingAgent,
    recallAgent,
    memesolAgent,
  },
  server: {
    apiRoutes: [
      registerApiRoute('/run-memesol', {
        method: 'POST',
        handler: async (c) => {
          const mastra = c.get('mastra');
          const inputData = await c.req.json(); // get POST body
          const workflow = mastra.getWorkflow('memesolWorkflow');
          if (!workflow) return c.json({ error: 'Workflow not found' }, 404);
          const run = await workflow.createRunAsync();
          const result = await run.start({ inputData });
          return c.json({ success: true, result });
        },
      }),
    ],
  },
  // Server configuration will be handled separately
});

// Export a function to run the memesol workflow
export async function runMemesolWorkflow(inputData: Record<string, any> = {}) {
  try {
    console.log('🚀 Starting MemeSol workflow execution...');
    const startTime = Date.now();

    const workflow = mastra.getWorkflow('memesolWorkflow');
    if (!workflow) {
      throw new Error('Workflow not found');
    }

    const result = await workflow.execute({
      inputData,
      // The framework will provide other required parameters
    } as any);

    const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Workflow completed in ${executionTime}s`);

    return {
      success: true,
      data: result,
      executionTime: `${executionTime}s`,
    };
  } catch (error) {
    console.error('❌ Workflow execution failed:', error);
    throw error;
  }
}

// Export MCP client for use in other parts of the application
export { mcp };
