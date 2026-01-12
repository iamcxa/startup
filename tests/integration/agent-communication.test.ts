// tests/integration/agent-communication.test.ts
/**
 * Tests for agent communication via bd comments.
 * Verifies the Message Bus pattern using bd comments with prefixes.
 */

import { assertEquals, assertExists, assertStringIncludes } from '@std/assert';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create a test claim (bd issue) for testing.
 */
async function createTestClaim(title: string): Promise<string> {
  const cmd = new Deno.Command('bd', {
    args: ['create', '--title', title, '--type', 'task'],
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
  if (!match) {
    throw new Error(`Could not parse claim ID from: ${output}`);
  }
  return match[1];
}

/**
 * Add a comment to a claim.
 */
async function addComment(claimId: string, comment: string): Promise<boolean> {
  const cmd = new Deno.Command('bd', {
    args: ['comments', 'add', claimId, comment],
    stdout: 'null',
    stderr: 'piped',
  });

  const { success } = await cmd.output();
  return success;
}

/**
 * Get all comments from a claim.
 */
async function getComments(claimId: string): Promise<string[]> {
  const cmd = new Deno.Command('bd', {
    args: ['comments', claimId],
    stdout: 'piped',
    stderr: 'null',
  });

  const { stdout, success } = await cmd.output();
  if (!success) return [];

  const output = new TextDecoder().decode(stdout).trim();
  if (!output) return [];

  return output.split('\n').filter(Boolean);
}

/**
 * Close (cleanup) a test claim.
 */
async function closeClaim(claimId: string): Promise<void> {
  const cmd = new Deno.Command('bd', {
    args: ['close', claimId, '--reason', 'Test cleanup'],
    stdout: 'null',
    stderr: 'null',
  });
  await cmd.output();
}

// ============================================================================
// Basic Comment Operations
// ============================================================================

Deno.test({
  name: 'bd comments - can add and read simple comment',
  async fn() {
    const claimId = await createTestClaim('Test Simple Comment');

    try {
      const success = await addComment(claimId, 'Hello from test');
      assertEquals(success, true, 'Should successfully add comment');

      const comments = await getComments(claimId);
      const hasComment = comments.some((c) => c.includes('Hello from test'));
      assertEquals(hasComment, true, 'Should find our comment');
    } finally {
      await closeClaim(claimId);
    }
  },
});

// ============================================================================
// QUESTION Prefix Tests
// ============================================================================

Deno.test({
  name: 'agents can write QUESTION comments',
  async fn() {
    const claimId = await createTestClaim('Test QUESTION Comment');

    try {
      const success = await addComment(claimId, 'QUESTION: Which database should we use?');
      assertEquals(success, true);

      const comments = await getComments(claimId);
      const questionComment = comments.find((c) => c.includes('QUESTION'));
      assertExists(questionComment, 'QUESTION comment should exist');
      assertStringIncludes(questionComment, 'Which database should we use?');
    } finally {
      await closeClaim(claimId);
    }
  },
});

Deno.test({
  name: 'QUESTION format is parseable by dispatcher',
  async fn() {
    const claimId = await createTestClaim('Test QUESTION Parsing');

    try {
      await addComment(claimId, 'QUESTION: Which auth provider should we integrate?');

      const comments = await getComments(claimId);
      const questionComment = comments.find((c) => c.includes('QUESTION'));
      assertExists(questionComment);

      // Verify format works with dispatcher
      const { parseComment, getDispatchAction } = await import(
        '../../src/startup/hooks/dispatcher.ts'
      );

      // Extract the QUESTION: ... part from the comment
      const contentMatch = questionComment.match(/QUESTION:.+/);
      if (contentMatch) {
        const parsed = parseComment(contentMatch[0]);
        assertEquals(parsed.prefix, 'QUESTION');

        const action = getDispatchAction(parsed.prefix, parsed.content);
        assertEquals(action.type, 'spawn');
        assertEquals(action.role, 'claim-agent');
      }
    } finally {
      await closeClaim(claimId);
    }
  },
});

// ============================================================================
// ANSWER Prefix Tests
// ============================================================================

Deno.test({
  name: 'agents can write ANSWER comments',
  async fn() {
    const claimId = await createTestClaim('Test ANSWER Comment');

    try {
      const success = await addComment(claimId, 'ANSWER: Use PostgreSQL for better reliability');
      assertEquals(success, true);

      const comments = await getComments(claimId);
      const answerComment = comments.find((c) => c.includes('ANSWER'));
      assertExists(answerComment, 'ANSWER comment should exist');
      assertStringIncludes(answerComment, 'Use PostgreSQL');
    } finally {
      await closeClaim(claimId);
    }
  },
});

// ============================================================================
// QUESTION/ANSWER Exchange Tests
// ============================================================================

Deno.test({
  name: 'agents can exchange QUESTION/ANSWER pairs',
  async fn() {
    const claimId = await createTestClaim('Test Q&A Exchange');

    try {
      // Trail Boss asks a question
      await addComment(claimId, 'QUESTION: Which authentication provider should we use?');

      // Claim Agent provides an answer
      await addComment(claimId, 'ANSWER: Use OAuth2 with Google - it matches our user requirements');

      // Verify both exist
      const comments = await getComments(claimId);

      const hasQuestion = comments.some((c) => c.includes('QUESTION'));
      const hasAnswer = comments.some((c) => c.includes('ANSWER'));

      assertEquals(hasQuestion, true, 'Should have QUESTION comment');
      assertEquals(hasAnswer, true, 'Should have ANSWER comment');
    } finally {
      await closeClaim(claimId);
    }
  },
});

Deno.test({
  name: 'multiple QUESTION/ANSWER exchanges work correctly',
  async fn() {
    const claimId = await createTestClaim('Test Multiple Q&A');

    try {
      // First exchange
      await addComment(claimId, 'QUESTION: Which database?');
      await addComment(claimId, 'ANSWER: PostgreSQL');

      // Second exchange
      await addComment(claimId, 'QUESTION: Which cache?');
      await addComment(claimId, 'ANSWER: Redis');

      // Verify all exist
      const comments = await getComments(claimId);

      const questions = comments.filter((c) => c.includes('QUESTION'));
      const answers = comments.filter((c) => c.includes('ANSWER'));

      assertEquals(questions.length >= 2, true, 'Should have at least 2 questions');
      assertEquals(answers.length >= 2, true, 'Should have at least 2 answers');
    } finally {
      await closeClaim(claimId);
    }
  },
});

// ============================================================================
// SPAWN Prefix Tests
// ============================================================================

Deno.test({
  name: 'agents can write SPAWN commands',
  async fn() {
    const claimId = await createTestClaim('Test SPAWN Command');

    try {
      const success = await addComment(claimId, 'SPAWN: surveyor --task "Design the authentication system"');
      assertEquals(success, true);

      const comments = await getComments(claimId);
      const spawnComment = comments.find((c) => c.includes('SPAWN'));
      assertExists(spawnComment, 'SPAWN comment should exist');
      assertStringIncludes(spawnComment, 'surveyor');
      assertStringIncludes(spawnComment, 'Design the authentication system');
    } finally {
      await closeClaim(claimId);
    }
  },
});

Deno.test({
  name: 'SPAWN format is parseable by dispatcher',
  async fn() {
    const claimId = await createTestClaim('Test SPAWN Parsing');

    try {
      await addComment(claimId, 'SPAWN: miner --task "Implement OAuth integration"');

      const comments = await getComments(claimId);
      const spawnComment = comments.find((c) => c.includes('SPAWN'));
      assertExists(spawnComment);

      // Verify format works with dispatcher
      const { parseComment, parseSpawnCommand, getDispatchAction } = await import(
        '../../src/startup/hooks/dispatcher.ts'
      );

      const contentMatch = spawnComment.match(/SPAWN:.+/);
      if (contentMatch) {
        const parsed = parseComment(contentMatch[0]);
        assertEquals(parsed.prefix, 'SPAWN');

        const spawn = parseSpawnCommand(parsed.content);
        assertEquals(spawn?.role, 'miner');
        assertEquals(spawn?.task, 'Implement OAuth integration');

        const action = getDispatchAction(parsed.prefix, parsed.content);
        assertEquals(action.type, 'spawn');
        assertEquals(action.role, 'miner');
      }
    } finally {
      await closeClaim(claimId);
    }
  },
});

// ============================================================================
// OUTPUT Prefix Tests
// ============================================================================

Deno.test({
  name: 'agents can write OUTPUT comments',
  async fn() {
    const claimId = await createTestClaim('Test OUTPUT Comment');

    try {
      const success = await addComment(claimId, 'OUTPUT: design=docs/plans/auth-design.md files=3');
      assertEquals(success, true);

      const comments = await getComments(claimId);
      const outputComment = comments.find((c) => c.includes('OUTPUT'));
      assertExists(outputComment, 'OUTPUT comment should exist');
      assertStringIncludes(outputComment, 'design=');
    } finally {
      await closeClaim(claimId);
    }
  },
});

// ============================================================================
// PROGRESS Prefix Tests
// ============================================================================

Deno.test({
  name: 'agents can write PROGRESS comments',
  async fn() {
    const claimId = await createTestClaim('Test PROGRESS Comment');

    try {
      const success = await addComment(claimId, 'PROGRESS: 3/5 tasks completed');
      assertEquals(success, true);

      const comments = await getComments(claimId);
      const progressComment = comments.find((c) => c.includes('PROGRESS'));
      assertExists(progressComment, 'PROGRESS comment should exist');
    } finally {
      await closeClaim(claimId);
    }
  },
});

// ============================================================================
// Full Communication Flow Tests
// ============================================================================

Deno.test({
  name: 'Full flow: QUESTION → ANSWER → SPAWN → OUTPUT',
  async fn() {
    const claimId = await createTestClaim('Test Full Communication Flow');

    try {
      // Step 1: Trail Boss asks question
      await addComment(claimId, 'QUESTION: Which authentication method should we use?');

      // Step 2: Claim Agent answers
      await addComment(claimId, 'ANSWER: OAuth2 with Google - matches requirements');

      // Step 3: Trail Boss spawns Surveyor
      await addComment(claimId, 'SPAWN: surveyor --task "Design OAuth integration"');

      // Step 4: Surveyor reports output
      await addComment(claimId, 'OUTPUT: design=docs/plans/oauth-design.md');

      // Step 5: Progress update
      await addComment(claimId, 'PROGRESS: Design phase complete');

      // Verify full flow
      const comments = await getComments(claimId);

      assertEquals(comments.some((c) => c.includes('QUESTION')), true, 'Should have QUESTION');
      assertEquals(comments.some((c) => c.includes('ANSWER')), true, 'Should have ANSWER');
      assertEquals(comments.some((c) => c.includes('SPAWN')), true, 'Should have SPAWN');
      assertEquals(comments.some((c) => c.includes('OUTPUT')), true, 'Should have OUTPUT');
      assertEquals(comments.some((c) => c.includes('PROGRESS')), true, 'Should have PROGRESS');
    } finally {
      await closeClaim(claimId);
    }
  },
});
