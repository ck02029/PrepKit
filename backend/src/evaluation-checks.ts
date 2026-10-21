const curatedUrls = new Set([
  "https://leetcode.com/problems/two-sum/",
  "https://leetcode.com/problems/binary-search/",
  "https://leetcode.com/problems/maximum-depth-of-binary-tree/",
  "https://leetcode.com/problems/number-of-islands/",
  "https://developer.mozilla.org/",
  "https://nodejs.org/docs/latest/api/",
  "https://www.postgresql.org/docs/",
  "https://github.com/donnemartin/system-design-primer",
]);

export type EvaluationKit = {
  role: { title: string; requirements: Array<{ id: string; priority: string }> };
  questions: Array<{ prompt: string; requirement_ids: string[]; evidence_ids?: string[]; coding_links?: Array<{ url: string; verified: boolean }> }>;
  practice_topics: Array<{ label: string; evidence_ids?: string[]; learning_resources?: Array<{ url: string }> }>;
  flashcards: Array<{ evidence_ids?: string[] }>;
  interview_research: { rounds: Array<{ confidence: string | null; sources: Array<{ url: string }> }> };
  source: { pages_used: string[] };
  company_brief: { sources: string[] };
};

export function evaluateKitProperties(kit: EvaluationKit, evidenceChunkIds: Set<string>, minimumQuestionsPerMust = 1): string[] {
  const violations: string[] = [];
  const normalized = kit.questions.map((question) => question.prompt.toLowerCase().replace(/\s+/g, " ").trim());
  if (new Set(normalized).size !== normalized.length) violations.push("Questions contain duplicates after case and whitespace normalization.");
  for (const requirement of kit.role.requirements.filter((item) => item.priority === "must")) {
    const count = kit.questions.filter((question) => question.requirement_ids.includes(requirement.id)).length;
    if (count < minimumQuestionsPerMust) violations.push(`Must requirement ${requirement.id} has ${count} questions; expected at least ${minimumQuestionsPerMust}.`);
  }
  const knownSourceUrls = new Set([...kit.source.pages_used, ...kit.company_brief.sources, ...kit.interview_research.rounds.flatMap((round) => round.sources.map((source) => source.url))]);
  for (const round of kit.interview_research.rounds) {
    if ((round.confidence === "high" || round.confidence === "medium") && round.sources.length === 0) violations.push(`Round ${round.confidence} has no source.`);
  }
  for (const item of [...kit.questions, ...kit.practice_topics, ...kit.flashcards]) {
    for (const evidenceId of item.evidence_ids ?? []) if (!evidenceChunkIds.has(evidenceId)) violations.push(`Evidence ID ${evidenceId} does not resolve to a stored chunk.`);
  }
  for (const question of kit.questions) {
    for (const link of question.coding_links ?? []) if (!link.verified && !curatedUrls.has(link.url) && !knownSourceUrls.has(link.url)) violations.push(`Coding URL ${link.url} is neither verified nor in the catalog.`);
  }
  for (const topic of kit.practice_topics) {
    for (const resource of topic.learning_resources ?? []) if (!curatedUrls.has(resource.url) && !knownSourceUrls.has(resource.url)) violations.push(`Study URL ${resource.url} is neither verified nor in the catalog.`);
  }
  return [...new Set(violations)];
}

export function evaluateTopicDiversity(frontendLabels: string[], dataEngineeringLabels: string[]): string[] {
  const tokenize = (labels: string[]) => new Set(labels.join(" ").toLowerCase().match(/[a-z0-9+#]{3,}/g) ?? []);
  const frontend = tokenize(frontendLabels), data = tokenize(dataEngineeringLabels);
  if (!frontend.size || !data.size) return ["Frontend and data-engineering fixtures must both produce topics."];
  const union = new Set([...frontend, ...data]);
  const shared = [...frontend].filter((term) => data.has(term)).length;
  return shared / union.size >= 0.8 ? ["Frontend and data-engineering topic labels are too similar."] : [];
}
