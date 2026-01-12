// src/startup/cli/survey.ts
export interface SurveyOptions {
  claimId?: string;
}

export function surveyCommand(options: SurveyOptions): void {
  const { claimId } = options;

  if (claimId) {
    // Show specific Caravan
    console.log(`Surveying Caravan: ${claimId}`);
    // TODO: bd show $claimId
  } else {
    // List all Caravans
    console.log('Surveying all Caravans...');
    // TODO: bd list --label pd:caravan
  }

  console.log('\n[TODO] Implement bd integration');
}
