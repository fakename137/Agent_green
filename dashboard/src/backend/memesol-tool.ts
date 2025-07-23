import {
  createVincentTool,
  supportedPoliciesForTool,
} from '@lit-protocol/vincent-tool-sdk';
import { z } from 'zod';
import { mastra } from '../../../src/mastra/index';

let cachedResult: any = null;
let cachedAt: number = 0;

export async function runMemesolWorkflowCached() {
  const now = Date.now();
  // 1 hour = 3600000 ms
  if (cachedResult && now - cachedAt < 3600000) {
    return cachedResult;
  }
  const workflow = mastra.getWorkflow('memesolWorkflow');
  if (!workflow) throw new Error('memesolWorkflow not found');
  const run = await workflow.createRunAsync();
  const result = await run.start({ inputData: {} });
  cachedResult = result;
  cachedAt = now;
  return result;
}
