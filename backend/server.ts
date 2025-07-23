import express from 'express';
import cors from 'cors';
import { mastra } from '../src/mastra';

// Create a new Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString() 
  });
});

// Memesol workflow execution endpoint
app.post('/api/run-workflow', async (req, res) => {
  try {
    const inputData = req.body || {};
    
    const workflow = mastra.getWorkflow('memesolWorkflow');
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    console.log('🚀 Starting MemeSol workflow execution...');
    const startTime = Date.now();
    
    const result = await workflow.execute({
      inputData,
      // The framework will provide other required parameters
    } as any);
    
    const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Workflow completed in ${executionTime}s`);
    
    res.json({
      success: true,
      data: result,
      executionTime: `${executionTime}s`
    });
    
  } catch (error) {
    console.error('❌ API Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      timestamp: new Date().toISOString()
    });
  }
});

// Start the server
const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});

export default app;
