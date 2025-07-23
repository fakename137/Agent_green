import { mastra } from './src/mastra/index';
import { writeFile } from 'fs/promises';

async function main() {
  try {
    console.log('🚀 Starting MemeSol Autonomous Trading Workflow...');

    const workflow = mastra.getWorkflow('memesolWorkflow');
    if (!workflow) {
      throw new Error(
        'memesolWorkflow not found. Make sure the workflow is properly registered.'
      );
    }

    console.log('✅ Workflow found, creating run...');
    const run = await workflow.createRunAsync();

    console.log('🔄 Executing workflow steps...');
    const startTime = Date.now();
    const result = await run.start({ inputData: {} });
    const endTime = Date.now();

    console.log(`⏱️ Workflow completed in ${(endTime - startTime) / 1000}s`);

    // Save the entire result object, including all steps, status, and outputs
    const filename = `memesol-trades-${new Date().toISOString().split('T')[0]}.json`;
    await writeFile(filename, JSON.stringify(result, null, 2), 'utf-8');

    console.log(`💾 Full workflow results saved to ${filename}`);

    // Print summary
    if (result.output && result.output.tokens) {
      console.log(`\n📊 SUMMARY:`);
      console.log(`- Tokens analyzed: ${result.output.tokens.length}`);
      console.log(
        `- High scoring tokens: ${result.output.tokens.filter((t: any) => t.score >= 60).length}`
      );
      console.log(
        `- Categories: ${[...new Set(result.output.tokens.map((t: any) => t.category))].join(', ')}`
      );
    }

    if (result.steps) {
      console.log(`\n🔧 STEP STATUS:`);
      result.steps.forEach((step: any, i: number) => {
        const status =
          step.status === 'COMPLETED'
            ? '✅'
            : step.status === 'FAILED'
              ? '❌'
              : '⏳';
        console.log(`${status} Step ${i + 1}: ${step.stepId}`);
      });
    }
  } catch (err) {
    console.error('❌ Error running workflow:', err);

    // Save error details
    const errorLog = {
      timestamp: new Date().toISOString(),
      error:
        err instanceof Error
          ? {
              message: err.message,
              stack: err.stack,
              name: err.name,
            }
          : err,
    };

    await writeFile(
      `memesol-error-${Date.now()}.json`,
      JSON.stringify(errorLog, null, 2),
      'utf-8'
    );

    process.exit(1);
  }
}

main();
