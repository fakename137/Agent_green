// Test script for MemeSol multiStageTokenFilter
(async () => {
  try {
    const { multiStageTokenFilter } = await import(
      './src/mastra/tools/memesol-tool.ts'
    );
    const result = await multiStageTokenFilter();
    console.dir(result, { depth: null });
  } catch (err) {
    console.error('Test failed:', err);
  }
})();
