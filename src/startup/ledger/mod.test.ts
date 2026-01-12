// src/startup/ledger/mod.test.ts
/**
 * Tests for the Decision Ledger module.
 * Verifies bd CLI integration for ledger operations.
 */

import { assertEquals, assertExists, assertStringIncludes } from '@std/assert';
import {
  addDecision,
  ensureLedger,
  findLedger,
  getDecisionHistory,
} from './mod.ts';

// ============================================================================
// findLedger Tests
// ============================================================================

Deno.test({
  name: 'findLedger - returns string or null without throwing',
  async fn() {
    const ledgerId = await findLedger();

    // Should return either a valid ID or null
    assertEquals(
      typeof ledgerId === 'string' || ledgerId === null,
      true,
      'Should return string or null',
    );

    // If found, should have correct format
    if (ledgerId !== null) {
      assertEquals(
        ledgerId.startsWith('pd-') || ledgerId.startsWith('beads-'),
        true,
        'Ledger ID should have valid prefix',
      );
    }
  },
});

// ============================================================================
// ensureLedger Tests
// ============================================================================

Deno.test({
  name: 'ensureLedger - creates or finds existing ledger',
  async fn() {
    const ledgerId = await ensureLedger();

    assertExists(ledgerId, 'Should return a ledger ID');
    assertEquals(typeof ledgerId, 'string');
    assertEquals(
      ledgerId.startsWith('pd-') || ledgerId.startsWith('beads-'),
      true,
      'Ledger ID should have valid prefix',
    );
  },
});

Deno.test({
  name: 'ensureLedger - returns same ID on repeated calls (idempotent)',
  async fn() {
    const ledgerId1 = await ensureLedger();
    const ledgerId2 = await ensureLedger();

    assertEquals(ledgerId1, ledgerId2, 'Should return same ledger ID');
  },
});

// ============================================================================
// getDecisionHistory Tests
// ============================================================================

Deno.test({
  name: 'getDecisionHistory - returns array (possibly empty)',
  async fn() {
    const ledgerId = await ensureLedger();
    const history = await getDecisionHistory(ledgerId);

    assertEquals(Array.isArray(history), true, 'Should return an array');
  },
});

Deno.test({
  name: 'getDecisionHistory - filters to DECISION entries only',
  async fn() {
    const ledgerId = await ensureLedger();
    const history = await getDecisionHistory(ledgerId);

    // All entries should contain DECISION (format: "[username] DECISION ...")
    for (const entry of history) {
      assertEquals(
        entry.includes('DECISION'),
        true,
        `Entry should contain DECISION: ${entry}`,
      );
    }
  },
});

// ============================================================================
// addDecision Tests
// ============================================================================

Deno.test({
  name: 'addDecision - adds decision to ledger successfully',
  async fn() {
    const ledgerId = await ensureLedger();
    const testCaravanId = `test-caravan-${Date.now()}`;

    const success = await addDecision(
      ledgerId,
      testCaravanId,
      'Which database should we use?',
      'PostgreSQL',
      'high',
      'project requirements',
      'Company standard database, good performance',
    );

    assertEquals(success, true, 'Should successfully add decision');
  },
});

Deno.test({
  name: 'addDecision - decision appears in history',
  async fn() {
    const ledgerId = await ensureLedger();
    const testCaravanId = `test-caravan-history-${Date.now()}`;

    // Add a decision
    await addDecision(
      ledgerId,
      testCaravanId,
      'Which auth provider?',
      'OAuth2 with Google',
      'medium',
      'user requirements',
      'Users requested Google login',
    );

    // Get history and verify
    const history = await getDecisionHistory(ledgerId);

    // Find our test decision
    const ourDecision = history.find((d) => d.includes(testCaravanId));
    assertExists(ourDecision, 'Our decision should appear in history');
    assertStringIncludes(ourDecision, 'DECISION');
    assertStringIncludes(ourDecision, testCaravanId);
  },
});

Deno.test({
  name: 'addDecision - handles all confidence levels',
  async fn() {
    const ledgerId = await ensureLedger();
    const confidenceLevels: Array<'high' | 'medium' | 'low' | 'escalated'> = [
      'high',
      'medium',
      'low',
      'escalated',
    ];

    for (const confidence of confidenceLevels) {
      const success = await addDecision(
        ledgerId,
        `confidence-test-${confidence}`,
        'Test question?',
        'Test answer',
        confidence,
        'test',
        'testing confidence levels',
      );

      assertEquals(
        success,
        true,
        `Should handle confidence level: ${confidence}`,
      );
    }
  },
});

// ============================================================================
// Integration Tests: Full Flow
// ============================================================================

Deno.test({
  name: 'Ledger flow: ensure → add → retrieve',
  async fn() {
    // Step 1: Ensure ledger exists
    const ledgerId = await ensureLedger();
    assertExists(ledgerId);

    // Step 2: Add multiple decisions
    const uniqueId = Date.now().toString(36);

    await addDecision(
      ledgerId,
      `flow-test-${uniqueId}-1`,
      'Question 1?',
      'Answer 1',
      'high',
      'source1',
      'reasoning1',
    );

    await addDecision(
      ledgerId,
      `flow-test-${uniqueId}-2`,
      'Question 2?',
      'Answer 2',
      'medium',
      'source2',
      'reasoning2',
    );

    // Step 3: Retrieve and verify
    const history = await getDecisionHistory(ledgerId);

    const decision1 = history.find((d) => d.includes(`flow-test-${uniqueId}-1`));
    const decision2 = history.find((d) => d.includes(`flow-test-${uniqueId}-2`));

    assertExists(decision1, 'First decision should exist');
    assertExists(decision2, 'Second decision should exist');
  },
});
