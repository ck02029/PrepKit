export type PracticeQuestionCategory = "technical" | "behavioural" | "system-design" | "company-fit";
export type PracticeTopicLink = { id: string; label: string; subtopics?: string[] };

const topicPatterns: Record<PracticeQuestionCategory, RegExp> = {
  technical: /data structures|algorithms|coding implementation|core computer science|programming|debugging|\bsql\b|query|metrics|analytics|statistics|experiment|modeling|machine learning|fundamentals|practical .*exercise|engineering|cloud|security|testing|network|operations|\bqa\b|quality|finance|accounting/i,
  behavioural: /behavior|behaviour|resume|experience|project deep dive|collaboration|leadership|execution|prioritization|stakeholder|communication|project|team/i,
  "system-design": /system design|architecture|low.level design|\bLLD\b|object.oriented|\bOOD\b|\bOOP\b/i,
  "company-fit": /company fit|culture|company motivation|product sense|user problem|strategy|market context|customer|role knowledge|sales|marketing|business operations|human resources|supply chain|healthcare|technical writing|visual and graphic design|behavior|behaviour|collaboration/i,
};

export function topicsForQuestionCategory(category: PracticeQuestionCategory, topics: PracticeTopicLink[]): PracticeTopicLink[] {
  return topics.filter((topic) => topicPatterns[category].test(`${topic.label} ${(topic.subtopics ?? []).join(" ")}`));
}

/** Assign an unlinked question to its closest role topic so topic sessions and
 * the topic-prioritized schedule do not silently lose valid generated content. */
export function inferQuestionTopicIds(category: PracticeQuestionCategory, text: string, topics: PracticeTopicLink[]): string[] {
  const candidates = topicsForQuestionCategory(category, topics);
  if (!candidates.length) return [];
  const prompt = text.toLowerCase();
  const directPreference = category === "system-design"
    ? /\b(real project|project you built|your project|resume|personal contribution)\b/i.test(prompt)
      ? /project architecture|project deep dive|resume|experience/i
      : /\b(class|classes|interface|interfaces|object.oriented|low.level|\blld\b|\bood\b|entity|encapsulation|inheritance|checkout|library component)\b/i.test(prompt)
      ? /low.level design|object.oriented/i
      : /\b(api|service|scale|scalability|architecture|distributed|data flow|storage|reliability|availability)\b/i.test(prompt)
        ? /system design|architecture/i
        : null
    : category === "technical"
      ? /\b(operating system|thread|process|memory|database|transaction|index|network|http|dns)\b/i.test(prompt)
        ? /core computer science/i
        : /\b(implement|implementation|write code|debug|unit test|testability)\b/i.test(prompt)
          ? /coding implementation/i
          : /\b(array|graph|algorithm|complexity|dynamic programming)\b/i.test(prompt)
          ? /data structures and algorithms|coding implementation/i
          : null
      : category === "behavioural" && /\b(resume|project|experience|contribution|achievement)\b/i.test(prompt)
        ? /resume|project deep dive|experience/i
        : null;
  if (directPreference) {
    const preferred = candidates.find((topic) => directPreference.test(topic.label));
    if (preferred) return [preferred.id];
  }

  const stopWords = new Set(["about", "after", "also", "because", "before", "could", "explain", "from", "have", "into", "that", "their", "there", "these", "they", "this", "through", "what", "when", "where", "which", "while", "with", "would", "your", "role", "question", "interview", "practice", "topic"]);
  const words = (value: string) => value.toLowerCase().match(/[a-z0-9+#]+/g)?.filter((word) => word.length > 2 && !stopWords.has(word)) ?? [];
  const promptWords = new Set(words(text));
  const ranked = candidates.map((topic, index) => {
    const labelWords = words(topic.label);
    const detailWords = words((topic.subtopics ?? []).join(" "));
    const score = labelWords.reduce((total, word) => total + (promptWords.has(word) ? 3 : 0), 0)
      + detailWords.reduce((total, word) => total + (promptWords.has(word) ? 1 : 0), 0);
    return { topic, score, index };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  return [ranked[0]!.topic.id];
}
