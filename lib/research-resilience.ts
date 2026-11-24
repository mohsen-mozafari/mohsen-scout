export type IndependentResearchStage = {
  name: string;
  run: () => Promise<unknown>;
};

export type IndependentResearchStageResult = {
  failures: { name: string }[];
};

/**
 * Runs optional evidence providers concurrently without allowing one provider's
 * unexpected rejection to cancel the other providers or the local analysis.
 */
export async function runIndependentResearchStages(
  stages: readonly IndependentResearchStage[],
): Promise<IndependentResearchStageResult> {
  const outcomes = await Promise.allSettled(stages.map((stage) => stage.run()));
  return {
    failures: outcomes.flatMap((outcome, index) =>
      outcome.status === 'rejected' ? [{ name: stages[index]?.name ?? 'Research provider' }] : [],
    ),
  };
}
