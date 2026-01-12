// src/startup/hooks/dispatcher.ts

/**
 * Message prefixes used in bd comments for inter-Prospect communication.
 */
export type MessagePrefix =
  | 'QUESTION'
  | 'ANSWER'
  | 'OUTPUT'
  | 'PROGRESS'
  | 'SPAWN'
  | 'DECISION'
  | 'CHECKPOINT';

/**
 * Parse a bd comment to extract prefix and content.
 */
export function parseComment(comment: string): { prefix: MessagePrefix | null; content: string } {
  const match = comment.match(/^([A-Z]+):\s*(.*)$/s);
  if (!match) {
    return { prefix: null, content: comment };
  }

  const prefix = match[1] as MessagePrefix;
  const validPrefixes: MessagePrefix[] = [
    'QUESTION',
    'ANSWER',
    'OUTPUT',
    'PROGRESS',
    'SPAWN',
    'DECISION',
    'CHECKPOINT',
  ];

  if (!validPrefixes.includes(prefix)) {
    return { prefix: null, content: comment };
  }

  return { prefix, content: match[2].trim() };
}

/**
 * Parse SPAWN command content.
 * Format: "SPAWN: <role> --task "<task>""
 */
export function parseSpawnCommand(content: string): { role: string; task: string } | null {
  // content is everything after "SPAWN: "
  const parts = content.split(/\s+/);
  if (parts.length === 0) return null;

  const role = parts[0];
  const taskMatch = content.match(/--task\s+"([^"]+)"/);
  const task = taskMatch ? taskMatch[1] : '';

  return { role, task };
}

/**
 * Determine what action to take based on message prefix.
 */
export interface DispatchAction {
  type: 'spawn' | 'notify' | 'log' | 'none';
  role?: string;
  task?: string;
  message?: string;
}

export function getDispatchAction(prefix: MessagePrefix | null, content: string): DispatchAction {
  switch (prefix) {
    case 'QUESTION':
      return { type: 'spawn', role: 'claim-agent' };

    case 'SPAWN': {
      const parsed = parseSpawnCommand(content);
      if (parsed) {
        return { type: 'spawn', role: parsed.role, task: parsed.task };
      }
      return { type: 'none' };
    }

    case 'OUTPUT':
    case 'ANSWER':
      return { type: 'notify', message: content };

    case 'PROGRESS':
    case 'DECISION':
    case 'CHECKPOINT':
      return { type: 'log', message: content };

    default:
      return { type: 'none' };
  }
}
