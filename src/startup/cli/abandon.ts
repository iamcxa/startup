// src/startup/cli/abandon.ts
export interface AbandonOptions {
  claimId?: string;
  force?: boolean;
}

export function abandonCommand(options: AbandonOptions): void {
  const { claimId, force: _force } = options;

  if (claimId) {
    // Abandon specific Caravan
    console.log(`Abandoning Caravan: ${claimId}`);
    // TODO: Kill tmux session for claimId
    // TODO: Update bd status to closed
  } else {
    // Abandon current/most recent Caravan
    console.log('Abandoning current Caravan...');
    // TODO: Find current tmux session
    // TODO: Kill session
    // TODO: Update bd status
  }

  console.log('\n[TODO] Implement tmux session kill and bd update');
}
