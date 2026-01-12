// src/startup/cli/continue.ts
export interface ContinueOptions {
  claimId?: string;
}

export function continueCommand(options: ContinueOptions): void {
  const { claimId } = options;

  if (claimId) {
    // Resume specific Caravan
    console.log(`Resuming Caravan: ${claimId}`);
    // TODO: Find tmux session for claimId
    // TODO: Reattach to session
  } else {
    // Resume most recent active Caravan
    console.log('Resuming most recent Caravan...');
    // TODO: bd list --label pd:caravan --status in_progress --limit 1
    // TODO: Find tmux session
    // TODO: Reattach to session
  }

  console.log('\n[TODO] Implement tmux session reattach');
}
