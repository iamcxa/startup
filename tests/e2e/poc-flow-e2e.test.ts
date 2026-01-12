// tests/e2e/poc-flow-e2e.test.ts
/**
 * End-to-End tests for the POC event-driven flow.
 *
 * Tests the complete flow:
 * 1. Create test caravan (bd issue)
 * 2. Simulate Trail Boss writing QUESTION
 * 3. Verify hook would spawn claim-agent
 * 4. Simulate Claim Agent writing ANSWER
 * 5. Simulate Trail Boss writing SPAWN
 * 6. Verify hook would spawn surveyor
 * 7. Simulate Surveyor writing OUTPUT
 *
 * NOTE: These tests verify the dispatch logic and bd comments flow.
 * They do NOT actually spawn Claude (which would require API keys).
 */

import { assertEquals, assertExists, assertStringIncludes } from '@std/assert';

// ============================================================================
// Test Utilities
// ============================================================================

const generateClaimId = () => `pd-e2e-${Date.now().toString(36)}`;

async function createClaim(title: string, _claimId?: string): Promise<string> {
  // Note: bd CLI doesn't support --id flag, so we generate IDs automatically
  const args = ['create', '--title', title, '--type', 'task'];

  const cmd = new Deno.Command('bd', {
    args,
    stdout: 'piped',
    stderr: 'piped',
  });

  const { stdout, stderr, success } = await cmd.output();
  if (!success) {
    const errMsg = new TextDecoder().decode(stderr);
    throw new Error(`Failed to create test claim: ${errMsg}`);
  }

  const output = new TextDecoder().decode(stdout).trim();
  // Output format: "✓ Created issue: pd-xxx\n  Title: ..."
  const match = output.match(/Created issue:\s*(\S+)/);
  return match ? match[1] : '';
}

async function addComment(claimId: string, comment: string): Promise<boolean> {
  const cmd = new Deno.Command('bd', {
    args: ['comments', 'add', claimId, comment],
    stdout: 'null',
    stderr: 'null',
  });
  return (await cmd.output()).success;
}

async function getComments(claimId: string): Promise<string[]> {
  const cmd = new Deno.Command('bd', {
    args: ['comments', claimId],
    stdout: 'piped',
    stderr: 'null',
  });

  const { stdout, success } = await cmd.output();
  if (!success) return [];

  return new TextDecoder().decode(stdout).trim().split('\n').filter(Boolean);
}

async function closeClaim(claimId: string): Promise<void> {
  const cmd = new Deno.Command('bd', {
    args: ['close', claimId, '--reason', 'E2E test cleanup'],
    stdout: 'null',
    stderr: 'null',
  });
  await cmd.output();
}

async function cleanupTmuxSession(sessionName: string): Promise<void> {
  const cmd = new Deno.Command('tmux', {
    args: ['kill-session', '-t', sessionName],
    stdout: 'null',
    stderr: 'null',
  });
  await cmd.output();
}

// ============================================================================
// E2E Flow Tests
// ============================================================================

Deno.test({
  name: 'E2E: Complete POC flow - QUESTION → ANSWER → SPAWN → OUTPUT',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // Step 1: Create test caravan
    const claimId = await createClaim('E2E Test Caravan - Full Flow');
    assertExists(claimId, 'Should create claim');
    const sessionName = `startup-${claimId}`;

    try {
      // Step 2: Trail Boss writes QUESTION
      const q1Success = await addComment(claimId, 'QUESTION: Which authentication method should we use?');
      assertEquals(q1Success, true, 'Should add QUESTION comment');

      // Step 3: Verify QUESTION dispatch would spawn claim-agent
      const { parseComment, getDispatchAction } = await import(
        '../../src/startup/hooks/dispatcher.ts'
      );

      const questionParsed = parseComment('QUESTION: Which authentication method should we use?');
      const questionAction = getDispatchAction(questionParsed.prefix, questionParsed.content);

      assertEquals(questionAction.type, 'spawn', 'QUESTION should trigger spawn');
      assertEquals(questionAction.role, 'claim-agent', 'QUESTION should spawn claim-agent');

      // Step 4: Claim Agent writes ANSWER
      const a1Success = await addComment(claimId, 'ANSWER: Use OAuth2 with Google - matches user requirements');
      assertEquals(a1Success, true, 'Should add ANSWER comment');

      // Step 5: Verify ANSWER dispatch would notify
      const answerParsed = parseComment('ANSWER: Use OAuth2 with Google');
      const answerAction = getDispatchAction(answerParsed.prefix, answerParsed.content);

      assertEquals(answerAction.type, 'notify', 'ANSWER should trigger notify');

      // Step 6: Trail Boss writes SPAWN to create Surveyor
      const spawnContent = 'SPAWN: surveyor --task "Design OAuth2 integration"';
      const spawnSuccess = await addComment(claimId, spawnContent);
      assertEquals(spawnSuccess, true, 'Should add SPAWN comment');

      // Step 7: Verify SPAWN dispatch would spawn surveyor
      const spawnParsed = parseComment(spawnContent);
      const spawnAction = getDispatchAction(spawnParsed.prefix, spawnParsed.content);

      assertEquals(spawnAction.type, 'spawn', 'SPAWN should trigger spawn');
      assertEquals(spawnAction.role, 'surveyor', 'SPAWN should spawn surveyor');
      assertEquals(spawnAction.task, 'Design OAuth2 integration', 'SPAWN should include task');

      // Step 8: Surveyor writes OUTPUT
      const outputSuccess = await addComment(claimId, 'OUTPUT: design=docs/plans/oauth-design.md files=3');
      assertEquals(outputSuccess, true, 'Should add OUTPUT comment');

      // Step 9: Verify OUTPUT dispatch would notify
      const outputParsed = parseComment('OUTPUT: design=docs/plans/oauth-design.md');
      const outputAction = getDispatchAction(outputParsed.prefix, outputParsed.content);

      assertEquals(outputAction.type, 'notify', 'OUTPUT should trigger notify');

      // Step 10: Verify all comments recorded in bd
      const comments = await getComments(claimId);

      assertEquals(comments.some((c) => c.includes('QUESTION')), true, 'Should have QUESTION');
      assertEquals(comments.some((c) => c.includes('ANSWER')), true, 'Should have ANSWER');
      assertEquals(comments.some((c) => c.includes('SPAWN')), true, 'Should have SPAWN');
      assertEquals(comments.some((c) => c.includes('OUTPUT')), true, 'Should have OUTPUT');

    } finally {
      await closeClaim(claimId);
      await cleanupTmuxSession(sessionName);
    }
  },
});

Deno.test({
  name: 'E2E: Multiple QUESTION/ANSWER exchanges maintain context',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const claimId = await createClaim('E2E Test - Multiple Q&A');

    try {

      // First exchange
      await addComment(claimId, 'QUESTION: Which database should we use?');
      await addComment(claimId, 'ANSWER: PostgreSQL for reliability');

      // Second exchange
      await addComment(claimId, 'QUESTION: Which cache layer?');
      await addComment(claimId, 'ANSWER: Redis for speed');

      // Third exchange
      await addComment(claimId, 'QUESTION: Which message queue?');
      await addComment(claimId, 'ANSWER: RabbitMQ for durability');

      // Verify all recorded
      const comments = await getComments(claimId);

      const questions = comments.filter((c) => c.includes('QUESTION'));
      const answers = comments.filter((c) => c.includes('ANSWER'));

      assertEquals(questions.length >= 3, true, 'Should have 3+ questions');
      assertEquals(answers.length >= 3, true, 'Should have 3+ answers');

    } finally {
      await closeClaim(claimId);
    }
  },
});

Deno.test({
  name: 'E2E: SPAWN chain - Surveyor → Shift Boss → Miner',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const claimId = await createClaim('E2E Test - SPAWN Chain');

    try {

      const { parseComment, getDispatchAction, parseSpawnCommand } = await import(
        '../../src/startup/hooks/dispatcher.ts'
      );

      // Trail Boss spawns Surveyor
      const spawn1 = 'SPAWN: surveyor --task "Design the system"';
      await addComment(claimId, spawn1);

      const action1 = getDispatchAction(parseComment(spawn1).prefix, parseComment(spawn1).content);
      assertEquals(action1.role, 'surveyor');

      // Surveyor spawns Shift Boss
      const spawn2 = 'SPAWN: shift-boss --task "Plan implementation phases"';
      await addComment(claimId, spawn2);

      const action2 = getDispatchAction(parseComment(spawn2).prefix, parseComment(spawn2).content);
      assertEquals(action2.role, 'shift-boss');

      // Shift Boss spawns Miner
      const spawn3 = 'SPAWN: miner --task "Implement auth module"';
      await addComment(claimId, spawn3);

      const action3 = getDispatchAction(parseComment(spawn3).prefix, parseComment(spawn3).content);
      assertEquals(action3.role, 'miner');

      // Verify all spawns recorded
      const comments = await getComments(claimId);
      const spawns = comments.filter((c) => c.includes('SPAWN'));

      assertEquals(spawns.length >= 3, true, 'Should have 3+ SPAWN commands');

    } finally {
      await closeClaim(claimId);
    }
  },
});

Deno.test({
  name: 'E2E: Decision Ledger integration',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { ensureLedger, addDecision, getDecisionHistory } = await import(
      '../../src/startup/ledger/mod.ts'
    );

    const claimId = await createClaim('E2E Test - Ledger Integration');

    try {

      // Ensure ledger exists
      const ledgerId = await ensureLedger();
      assertExists(ledgerId, 'Should have ledger');

      // Simulate Claim Agent recording decision
      const success = await addDecision(
        ledgerId,
        claimId,
        'Which auth provider?',
        'OAuth2 with Google',
        'high',
        'user requirements doc',
        'Users specifically requested Google login',
      );
      assertEquals(success, true, 'Should record decision');

      // Verify decision in history
      const history = await getDecisionHistory(ledgerId);
      const ourDecision = history.find((d) => d.includes(claimId));

      assertExists(ourDecision, 'Our decision should be in history');
      assertStringIncludes(ourDecision, 'DECISION');

    } finally {
      await closeClaim(claimId);
    }
  },
});

Deno.test({
  name: 'E2E: PROGRESS and CHECKPOINT tracking',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const claimId = await createClaim('E2E Test - Progress Tracking');

    try {

      // Add progress updates
      await addComment(claimId, 'PROGRESS: 1/5 - Started design phase');
      await addComment(claimId, 'PROGRESS: 2/5 - Design complete');
      await addComment(claimId, 'CHECKPOINT: Design phase complete, ready for implementation');
      await addComment(claimId, 'PROGRESS: 3/5 - Implementation started');
      await addComment(claimId, 'PROGRESS: 4/5 - Core features done');
      await addComment(claimId, 'PROGRESS: 5/5 - All features complete');
      await addComment(claimId, 'CHECKPOINT: Implementation complete, ready for review');

      // Verify tracking
      const comments = await getComments(claimId);

      const progress = comments.filter((c) => c.includes('PROGRESS'));
      const checkpoints = comments.filter((c) => c.includes('CHECKPOINT'));

      assertEquals(progress.length >= 5, true, 'Should have 5+ progress updates');
      assertEquals(checkpoints.length >= 2, true, 'Should have 2+ checkpoints');

      // Verify dispatch actions
      const { parseComment, getDispatchAction } = await import(
        '../../src/startup/hooks/dispatcher.ts'
      );

      const progressAction = getDispatchAction(
        parseComment('PROGRESS: 1/5').prefix,
        '1/5',
      );
      assertEquals(progressAction.type, 'log', 'PROGRESS should log');

      const checkpointAction = getDispatchAction(
        parseComment('CHECKPOINT: Done').prefix,
        'Done',
      );
      assertEquals(checkpointAction.type, 'log', 'CHECKPOINT should log');

    } finally {
      await closeClaim(claimId);
    }
  },
});

Deno.test({
  name: 'E2E: Real tmux session creation with prospect command',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const claimId = await createClaim('E2E Test - Tmux Session');
    const sessionName = `startup-${claimId}`;

    try {
      // Spawn a prospect (with --background to not attach)
      const cmd = new Deno.Command('deno', {
        args: [
          'run', '--allow-all', 'startup.ts',
          'prospect', 'surveyor',
          '--claim', claimId,
          '--task', 'E2E test task',
          '--background',
        ],
        stdout: 'piped',
        stderr: 'piped',
        cwd: Deno.cwd(),
      });

      const { success } = await cmd.output();
      assertEquals(success, true, 'Prospect command should succeed');

      // Verify session exists
      const checkCmd = new Deno.Command('tmux', {
        args: ['has-session', '-t', sessionName],
        stdout: 'null',
        stderr: 'null',
      });
      const sessionExists = (await checkCmd.output()).success;

      assertEquals(sessionExists, true, 'Tmux session should exist');

      // Verify window name
      const listCmd = new Deno.Command('tmux', {
        args: ['list-windows', '-t', sessionName, '-F', '#{window_name}'],
        stdout: 'piped',
        stderr: 'null',
      });
      const { stdout } = await listCmd.output();
      const windows = new TextDecoder().decode(stdout);

      assertStringIncludes(windows, 'surveyor', 'Should have surveyor window');

    } finally {
      await closeClaim(claimId);
      await cleanupTmuxSession(sessionName);
    }
  },
});
