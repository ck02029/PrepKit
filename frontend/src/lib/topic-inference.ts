import type { PracticeTopic, RoleRequirement } from "@/lib/schema";

type TopicRule = {
  id: string;
  label: string;
  description: string;
  patterns: RegExp[];
  subtopics: string[];
  resources?: { label: string; url: string }[];
};

// Conservative prototype fallback: include a topic only when the JD names it.
// A connected generation service should replace this with evidence-backed output.
const rules: TopicRule[] = [
  { id: "dsa", label: "Data structures & algorithms", description: "Practise only the problem-solving areas named in this role description.", patterns: [/\bdata structures?\b/i, /\balgorithms?\b/i, /\bgraphs?\b/i, /\btrees?\b/i, /\bleetcode\b/i, /\bcoding challenges?\b/i], subtopics: ["Problem solving", "Complexity analysis"], resources: [{ label: "Striver A2Z DSA Sheet", url: "https://takeuforward.org/prep-hub/strivers-a2z-dsa-sheet" }] },
  { id: "system-design", label: "System design", description: "Prepare architecture and tradeoffs explicitly required by the role.", patterns: [/\bsystem design\b/i, /\bdistributed systems?\b/i, /\barchitecture\b/i, /\bscalab(?:le|ility)\b/i], subtopics: ["Architecture", "Scalability", "Tradeoffs"] },
  { id: "backend", label: "Backend engineering", description: "Review backend technologies and service responsibilities stated in the description.", patterns: [/\bbackend\b/i, /\bnode(?:\.js|js)\b/i, /\bjava\b/i, /\bpython\b/i, /\bREST APIs?\b/i, /\bmicroservices?\b/i], subtopics: ["Services", "APIs", "Reliability"] },
  { id: "databases", label: "Databases & data", description: "Focus on the data stores and data handling named by the role.", patterns: [/\bdatabases?\b/i, /\bSQL\b/i, /\bPostgreSQL\b/i, /\bMongoDB\b/i, /\bdata modeling\b/i, /\bcaching\b/i], subtopics: ["Data modeling", "Queries", "Storage tradeoffs"] },
  { id: "operating-systems", label: "Operating systems & concurrency", description: "Included because the job description calls out runtime or concurrency fundamentals.", patterns: [/\boperating systems?\b/i, /\bconcurrency\b/i, /\bthreads?\b/i, /\bprocesses\b/i, /\bsynchroni[sz]ation\b/i], subtopics: ["Processes and threads", "Concurrency"] },
  { id: "oop", label: "Object-oriented design", description: "Review object-oriented design concepts specifically requested for this role.", patterns: [/\bobject[- ]oriented\b/i, /\bOOP\b/i, /\bdesign patterns?\b/i], subtopics: ["Design principles", "Maintainable code"] },
  { id: "cloud-devops", label: "Cloud & infrastructure", description: "Prepare the infrastructure platforms and operations named in the description.", patterns: [/\bAWS\b/i, /\bAzure\b/i, /\bGCP\b/i, /\bKubernetes\b/i, /\bDocker\b/i, /\bCI\/CD\b/i, /\binfrastructure\b/i], subtopics: ["Deployment", "Operations", "Reliability"] },
  { id: "security", label: "Security", description: "Focus on security responsibilities explicitly mentioned for the role.", patterns: [/\bsecurity\b/i, /\bauthentication\b/i, /\bauthorization\b/i, /\bencryption\b/i, /\bthreat model(?:ing)?\b/i], subtopics: ["Threats", "Access control", "Secure design"] },
  { id: "behavioural", label: "Leadership & collaboration", description: "Prepare examples grounded in the collaboration and leadership expectations in this role.", patterns: [/\bmentor(?:ing)?\b/i, /\bleadership\b/i, /\bcollaborat(?:e|ion)\b/i, /\bstakeholders?\b/i, /\bcommunication skills?\b/i, /\bownership\b/i], subtopics: ["Ownership", "Collaboration", "Leadership"] },
];

function evidenceForRule(description: string, patterns: RegExp[]): string[] {
  const sentences = description.split(/(?<=[.!?])\s+|\n+/).map((part) => part.trim()).filter(Boolean);
  return sentences.filter((sentence) => patterns.some((pattern) => pattern.test(sentence))).slice(0, 3);
}

export function inferPracticeTopics(description: string, requirements: RoleRequirement[] = []): PracticeTopic[] {
  return rules.flatMap((rule) => {
    const evidence = evidenceForRule(description, rule.patterns);
    if (!evidence.length) return [];
    const requirementIds = requirements.filter((requirement) => rule.patterns.some((pattern) => pattern.test(requirement.text))).map((requirement) => requirement.id);
    return [{
      id: rule.id,
      label: rule.label,
      description: rule.description,
      subtopics: rule.subtopics,
      requirement_ids: requirementIds,
      learning_resources: rule.resources ?? [],
      basis: "job_description" as const,
      rationale: "Matched explicit wording in the provided job description. This is a draft, not verified interview-report data.",
      evidence,
      confidence: "low" as const,
    }];
  });
}
