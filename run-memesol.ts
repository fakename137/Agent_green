import { mastra } from './src/mastra/index';
import { writeFile } from 'fs/promises';

async function main() {
  try {
    const workflow = mastra.getWorkflow('memesolWorkflow');
    if (!workflow) throw new Error('memesolWorkflow not found');
    const run = await workflow.createRunAsync();
    const result = await run.start({ inputData: {} });
    // Save the entire result object, including all steps, status, and outputs
    await writeFile(
      'memesol-trades.json',
      JSON.stringify(result, null, 2),
      'utf-8'
    );
    console.log('Full workflow run result saved to memesol-trades.json');
  } catch (err) {
    console.error('Error running workflow:', err);
    process.exit(1);
  }
}

main();
