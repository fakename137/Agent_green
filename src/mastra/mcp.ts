import { MCPClient } from '@mastra/mcp';

// Configure MCPClient to connect to your server(s)
export const mcp = new MCPClient({
  servers: {
    'recall-competitions-mcp': {
      command: 'node',
      args: [
        '/Users/jayanthkoppala/Desktop/Developer/MCP-servers/js-recall/packages/mcp/dist/index.js',
      ],
      env: {
        RECALL_API_KEY: process.env.RECALL_API_KEY!,
        RECALL_API_URL: process.env.RECALL_API_URL!,
        RECALL_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY!,
        LOG_LEVEL: 'info',
      },
    },
  },
});
