// src/bq-test/judge.ts

export interface JudgeResult {
  score: number;
  reasoning: string;
}

export function createJudgePrompt(criteria: string, agentOutput: string): string {
  return `You are evaluating an AI agent's behavior quality.

## Evaluation Criteria
${criteria}

## Agent Output
\`\`\`
${agentOutput}
\`\`\`

## Instructions
1. Evaluate how well the agent's output meets the criteria
2. Provide a score from 0-10 (10 = perfect adherence)
3. Explain your reasoning

## Response Format
Score: [0-10]/10
Reasoning: [Your explanation]
`;
}

export function parseJudgeResponse(response: string): JudgeResult {
  // Extract score from "Score: N/10" format
  const scoreMatch = response.match(/Score:\s*(\d+)\s*\/\s*10/i);
  const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;

  // Extract reasoning
  const reasoningMatch = response.match(/Reasoning:\s*(.+)/is);
  const reasoning = reasoningMatch ? reasoningMatch[1].trim() : response;

  return { score, reasoning };
}

export async function evaluateWithJudge(
  criteria: string,
  agentOutput: string,
  minScore: number,
): Promise<{ passed: boolean; score: number; reasoning: string }> {
  // In real implementation, this would call Claude API
  // For now, return a mock result (await used for future API call)
  const prompt = createJudgePrompt(criteria, agentOutput);

  // Mock: if output contains expected patterns, give high score
  const hasSpawn = agentOutput.includes("SPAWN:");
  const hasOutput = agentOutput.includes("OUTPUT:");
  const hasDecision = agentOutput.includes("DECISION:");

  const score = hasSpawn || hasOutput || hasDecision ? 8 : 3;

  // Using await to satisfy async requirement - real impl will await API call
  return await Promise.resolve({
    passed: score >= minScore,
    score,
    reasoning: `Mock evaluation. Score based on label presence. Prompt: ${prompt.slice(0, 100)}...`,
  });
}
