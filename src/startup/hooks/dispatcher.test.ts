// src/startup/hooks/dispatcher.test.ts

import { assertEquals } from '@std/assert';
import {
  getDispatchAction,
  parseComment,
  parseSpawnCommand,
} from './dispatcher.ts';

Deno.test('parseComment - extracts QUESTION prefix', () => {
  const result = parseComment('QUESTION: Which auth provider?');
  assertEquals(result.prefix, 'QUESTION');
  assertEquals(result.content, 'Which auth provider?');
});

Deno.test('parseComment - extracts SPAWN prefix with task', () => {
  const result = parseComment('SPAWN: surveyor --task "Design auth system"');
  assertEquals(result.prefix, 'SPAWN');
  assertEquals(result.content, 'surveyor --task "Design auth system"');
});

Deno.test('parseComment - returns null prefix for non-prefixed text', () => {
  const result = parseComment('Just a regular comment');
  assertEquals(result.prefix, null);
  assertEquals(result.content, 'Just a regular comment');
});

Deno.test('parseComment - handles multiline content', () => {
  const result = parseComment('OUTPUT: design=docs/plans/auth.md\nfiles: 3');
  assertEquals(result.prefix, 'OUTPUT');
  assertEquals(result.content, 'design=docs/plans/auth.md\nfiles: 3');
});

Deno.test('parseSpawnCommand - parses role and task', () => {
  const result = parseSpawnCommand('surveyor --task "Design the feature"');
  assertEquals(result?.role, 'surveyor');
  assertEquals(result?.task, 'Design the feature');
});

Deno.test('parseSpawnCommand - parses role without task', () => {
  const result = parseSpawnCommand('claim-agent');
  assertEquals(result?.role, 'claim-agent');
  assertEquals(result?.task, '');
});

Deno.test('getDispatchAction - QUESTION spawns claim-agent', () => {
  const action = getDispatchAction('QUESTION', 'Which provider?');
  assertEquals(action.type, 'spawn');
  assertEquals(action.role, 'claim-agent');
});

Deno.test('getDispatchAction - SPAWN spawns specified role', () => {
  const action = getDispatchAction('SPAWN', 'surveyor --task "Design"');
  assertEquals(action.type, 'spawn');
  assertEquals(action.role, 'surveyor');
  assertEquals(action.task, 'Design');
});

Deno.test('getDispatchAction - OUTPUT notifies', () => {
  const action = getDispatchAction('OUTPUT', 'design=docs/plans/x.md');
  assertEquals(action.type, 'notify');
});

Deno.test('getDispatchAction - PROGRESS logs', () => {
  const action = getDispatchAction('PROGRESS', '3/5 steps done');
  assertEquals(action.type, 'log');
});
