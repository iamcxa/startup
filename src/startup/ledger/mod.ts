// src/startup/ledger/mod.ts

/**
 * Decision Ledger operations.
 * The Ledger is a bd epic that stores all Claim Agent decisions.
 */

const LEDGER_LABEL = 'pd:ledger';
const LEDGER_TITLE = 'Decision Ledger';

/**
 * Find existing ledger or return null.
 */
export async function findLedger(): Promise<string | null> {
  const cmd = new Deno.Command('bd', {
    args: ['list', '--label', LEDGER_LABEL, '--type', 'epic', '--limit', '1'],
    stdout: 'piped',
    stderr: 'null',
  });

  const result = await cmd.output();
  if (!result.success) return null;

  const output = new TextDecoder().decode(result.stdout).trim();
  if (!output) return null;

  // Output format: "pd-xxx [P2] [epic] open [pd:ledger] - Decision Ledger"
  const match = output.match(/^(\S+)\s+/);
  return match ? match[1] : null;
}

/**
 * Create a new ledger.
 */
export async function createLedger(): Promise<string | null> {
  const cmd = new Deno.Command('bd', {
    args: [
      'create',
      '--title', LEDGER_TITLE,
      '--type', 'epic',
      '--label', LEDGER_LABEL,
    ],
    stdout: 'piped',
    stderr: 'piped',
  });

  const result = await cmd.output();
  if (!result.success) {
    console.error('Failed to create ledger:', new TextDecoder().decode(result.stderr));
    return null;
  }

  const output = new TextDecoder().decode(result.stdout).trim();
  // Output format: "✓ Created issue: pd-xxx\n  Title: ..."
  const match = output.match(/Created issue:\s*(\S+)/);
  return match ? match[1] : null;
}

/**
 * Ensure ledger exists, creating if needed.
 */
export async function ensureLedger(): Promise<string> {
  const existing = await findLedger();
  if (existing) return existing;

  const created = await createLedger();
  if (!created) {
    throw new Error('Failed to create Decision Ledger');
  }
  return created;
}

/**
 * Get decision history from ledger.
 */
export async function getDecisionHistory(ledgerId: string): Promise<string[]> {
  const cmd = new Deno.Command('bd', {
    args: ['comments', ledgerId],
    stdout: 'piped',
    stderr: 'null',
  });

  const result = await cmd.output();
  if (!result.success) return [];

  const output = new TextDecoder().decode(result.stdout);
  const lines = output.split('\n');

  // Filter for DECISION - bd comments output format: "[username] DECISION ..."
  return lines.filter((line) => line.includes('DECISION'));
}

/**
 * Add a decision to the ledger.
 */
export async function addDecision(
  ledgerId: string,
  caravanId: string,
  question: string,
  answer: string,
  confidence: 'high' | 'medium' | 'low' | 'escalated',
  source: string,
  reasoning: string,
): Promise<boolean> {
  const comment = `DECISION caravan=${caravanId}
Q: ${question}
A: ${answer}
Confidence: ${confidence}
Source: ${source}
Reasoning: ${reasoning}`;

  const cmd = new Deno.Command('bd', {
    args: ['comments', 'add', ledgerId, comment],
    stdout: 'null',
    stderr: 'piped',
  });

  const result = await cmd.output();
  return result.success;
}
