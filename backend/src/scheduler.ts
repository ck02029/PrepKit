export type ScheduledQuestion = {
  id: string;
  practice_type?: "interview" | "coding" | "writing";
  difficulty?: 1 | 2 | 3;
  topic_ids?: string[];
  requirement_ids: string[];
};

export type ScheduledFlashcard = {
  id: string;
  topic_ids?: string[];
  requirement_ids: string[];
};

export type ScheduleRequirement = { id: string; text: string; priority: "must" | "nice" };
export type ScheduleTopic = { id: string; label: string };
export type ScheduleDay = {
  day: number;
  focus: string;
  question_ids: string[];
  flashcard_ids: string[];
  topic_ids: string[];
  requirement_ids: string[];
  minutes: number;
};
export type SchedulePlan = { days_available: number; days: ScheduleDay[]; warnings: string[] };

type ScheduleItem = {
  id: string;
  type: "question" | "flashcard";
  minutes: number;
  topicIds: string[];
  requirementIds: string[];
  mustCount: number;
  difficulty: number;
};

/** Build a deterministic, budget-bounded schedule. Items which cannot fit are
 * deliberately left out and reported so the UI can surface what needs attention. */
export function buildSchedule(
  days: number,
  questions: ScheduledQuestion[],
  cards: ScheduledFlashcard[],
  dailyBudget: number,
  requirements: ScheduleRequirement[],
  topics: ScheduleTopic[],
): SchedulePlan {
  if (!Number.isInteger(days) || days < 1) throw new RangeError("Schedule days must be a positive integer.");
  if (!Number.isInteger(dailyBudget) || dailyBudget < 1) throw new RangeError("The daily time budget must be a positive integer.");

  const mustIds = new Set(requirements.filter((item) => item.priority === "must").map((item) => item.id));
  const items: ScheduleItem[] = [
    ...questions.map((question) => ({
      id: question.id,
      type: "question" as const,
      minutes: question.practice_type === "coding" ? 35 : 15,
      topicIds: question.topic_ids ?? [],
      requirementIds: question.requirement_ids,
      mustCount: question.requirement_ids.filter((id) => mustIds.has(id)).length,
      difficulty: question.difficulty ?? 1,
    })),
    ...cards.map((card) => ({
      id: card.id,
      type: "flashcard" as const,
      minutes: 5,
      topicIds: card.topic_ids ?? [],
      requirementIds: card.requirement_ids,
      mustCount: card.requirement_ids.filter((id) => mustIds.has(id)).length,
      difficulty: 1,
    })),
  ];

  const dayRows: ScheduleDay[] = Array.from({ length: days }, (_, index) => ({
    day: index + 1,
    focus: "Review key role requirements and company notes",
    question_ids: [],
    flashcard_ids: [],
    topic_ids: [],
    requirement_ids: [],
    minutes: 0,
  }));
  const warnings: string[] = [];
  const scheduledIds = new Set<string>();
  const duplicateIds = new Set<string>();
  for (const item of items) {
    if (scheduledIds.has(item.id)) duplicateIds.add(item.id);
    scheduledIds.add(item.id);
  }
  if (duplicateIds.size) throw new Error(`Schedule items must have unique IDs: ${[...duplicateIds].join(", ")}`);

  // Prioritize must-have coverage, then place each item on the least-loaded day
  // that does not already cover its requirements. This spreads core practice.
  items.sort((a, b) => b.mustCount - a.mustCount || b.difficulty - a.difficulty || b.minutes - a.minutes || a.id.localeCompare(b.id));
  for (const item of items) {
    if (item.minutes > dailyBudget) {
      warnings.push(`${item.type} ${item.id} needs ${item.minutes} minutes, above the ${dailyBudget}-minute daily budget, so it was not scheduled.`);
      continue;
    }
    const eligible = dayRows.filter((candidate) => candidate.minutes + item.minutes <= dailyBudget);
    const day = eligible.sort((a, b) => {
      const aRepeated = item.requirementIds.filter((id) => a.requirement_ids.includes(id)).length;
      const bRepeated = item.requirementIds.filter((id) => b.requirement_ids.includes(id)).length;
      return aRepeated - bRepeated || a.minutes - b.minutes || a.day - b.day;
    })[0];
    if (!day) {
      warnings.push(`${item.type} ${item.id} did not fit in the available daily time budget and was not scheduled.`);
      continue;
    }
    if (item.type === "question") day.question_ids.push(item.id);
    else day.flashcard_ids.push(item.id);
    day.topic_ids.push(...item.topicIds);
    day.requirement_ids.push(...item.requirementIds);
    day.minutes += item.minutes;
  }

  const topicLabels = new Map(topics.map((topic) => [topic.id, topic.label]));
  const reviewTopicsByDay = new Map<number, string[]>();
  const coveredRequirements = new Set<string>();
  for (const day of dayRows) {
    day.topic_ids = [...new Set(day.topic_ids)];
    day.requirement_ids = [...new Set(day.requirement_ids)];
    day.requirement_ids.forEach((id) => coveredRequirements.add(id));
    if (day.day > 1) {
      const yesterdayTopics = new Set(dayRows[day.day - 2].topic_ids);
      const reviewCards = cards.filter((card) => (card.topic_ids ?? []).some((id) => yesterdayTopics.has(id)))
        .filter((card) => !day.flashcard_ids.includes(card.id))
        .slice(0, 2);
      const reviewedTopics = new Set<string>();
      for (const card of reviewCards) {
        if (day.minutes + 5 > dailyBudget) break;
        day.flashcard_ids.unshift(card.id);
        day.topic_ids.push(...(card.topic_ids ?? []));
        day.requirement_ids.push(...card.requirement_ids);
        day.minutes += 5;
        for (const id of card.topic_ids ?? []) if (yesterdayTopics.has(id)) reviewedTopics.add(id);
      }
      if (reviewedTopics.size) reviewTopicsByDay.set(day.day, [...reviewedTopics].map((id) => topicLabels.get(id) ?? "yesterday's topics"));
    }
    day.topic_ids = [...new Set(day.topic_ids)];
    day.requirement_ids = [...new Set(day.requirement_ids)];
    day.requirement_ids.forEach((id) => coveredRequirements.add(id));
    const labels = day.topic_ids.map((id) => topicLabels.get(id)).filter((label): label is string => Boolean(label));
    const reviewLabels = reviewTopicsByDay.get(day.day);
    if (reviewLabels?.length) day.focus = `Review yesterday: ${reviewLabels.slice(0, 2).join(" · ")}${labels.length ? ` · ${labels.slice(0, 2).join(" · ")}` : ""}`;
    else if (labels.length) day.focus = labels.slice(0, 3).join(" · ");
  }
  for (const requirement of requirements) {
    if (requirement.priority === "must" && !coveredRequirements.has(requirement.id)) {
      warnings.push(`Must-have requirement “${requirement.text}” has no scheduled practice content.`);
    }
  }
  return { days_available: days, days: dayRows, warnings };
}

/** Existing schedule persistence updates a day by its stable day number. This
 * helper documents and makes testable the rule that completed days stay done. */
export function preserveCompletedDays<T extends { day: number }>(
  previousDays: Array<{ day: number; status: "not_started" | "in_progress" | "completed"; completed_at?: string | null }>,
  rebuiltDays: T[],
) {
  const prior = new Map(previousDays.map((day) => [day.day, day]));
  return rebuiltDays.map((day) => {
    const previous = prior.get(day.day);
    return {
      ...day,
      status: previous?.status ?? "not_started" as const,
      completed_at: previous?.completed_at ?? null,
    };
  });
}
