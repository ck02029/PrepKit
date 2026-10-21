export type CoverageRequirement = { id: string; priority: "must" | "nice" };
export type CoverageQuestion = { requirement_ids: string[] };

export function uncoveredMustRequirements(requirements: CoverageRequirement[], questions: CoverageQuestion[]): string[] {
  const covered = new Set(questions.flatMap((question) => question.requirement_ids));
  return requirements.filter((requirement) => requirement.priority === "must" && !covered.has(requirement.id)).map((requirement) => requirement.id);
}

export async function generateWithCoverage<T extends CoverageQuestion>(
  requirements: CoverageRequirement[],
  firstPass: () => Promise<T[]>,
  secondPass: (uncoveredIds: string[]) => Promise<T[]>,
) {
  const initial = await firstPass();
  const missing = uncoveredMustRequirements(requirements, initial);
  if (!missing.length) return { questions: initial, passes: 1, uncovered: [] as string[] };
  const additional = await secondPass(missing);
  const questions = [...initial, ...additional];
  return { questions, passes: 2, uncovered: uncoveredMustRequirements(requirements, questions) };
}
