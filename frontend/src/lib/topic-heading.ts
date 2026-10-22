const conciseTitles: Array<[RegExp, string]> = [
  [/^data structures and algorithms$/i, "DSA"],
  [/^coding implementation$/i, "Coding"],
  [/^leadership principles(?: & behavioral)?$/i, "Leadership Principles"],
  [/^online assessment$/i, "Online assessment"],
  [/^core computer science foundations$/i, "CS fundamentals"],
  [/^object-oriented and low-level design$/i, "LLD / OOD"],
  [/^light system design \(optional for entry-level\)$/i, "System design (entry-level)"],
  [/^resume and project deep dive(?: \(practice\))?$/i, "Resume & projects"],
  [/^resume and experience deep dive(?: \(practice\))?$/i, "Resume & experience"],
  [/^behavioral and collaboration examples$/i, "Behavioral"],
  [/^metrics and analytical reasoning$/i, "Metrics & analysis"],
  [/^statistics and experiments$/i, "Stats & experiments"],
  [/^dashboards and communication$/i, "Dashboards"],
  [/^project and stakeholder deep dive$/i, "Project deep dive"],
  [/^product sense and user problems$/i, "Product sense"],
  [/^metrics and product analytics$/i, "Product metrics"],
  [/^execution and prioritization$/i, "Execution"],
  [/^strategy and market context$/i, "Strategy"],
  [/^leadership and collaboration examples$/i, "Leadership"],
  [/^programming and data manipulation$/i, "Programming & data"],
  [/^modeling and evaluation$/i, "Modeling"],
  [/^machine learning fundamentals$/i, "Machine learning"],
  [/^sql and data querying$/i, "SQL"],
  [/^forward deployed engineering fundamentals$/i, "FDE essentials"],
  [/^practical forward deployed engineering exercise$/i, "FDE case"],
  [/^experience and project discussion$/i, "Projects & impact"],
  [/^role knowledge:\s*human resources and recruiting$/i, "HR essentials"],
  [/^practical human resources and recruiting scenarios$/i, "HR scenarios"],
  [/^experience and collaboration examples$/i, "Experience & teamwork"],
  [/^project architecture discussion(?: \(practice\))?$/i, "Project architecture"],
  [/^resume and project deep dive(?: \(practice\))?$/i, "Resume & projects"],
];

export function topicHeading(label: string): string {
  const match = conciseTitles.find(([pattern]) => pattern.test(label.trim()));
  if (match) return match[1];
  const compact = label.trim().replace(/\s+\(practice\)$/i, "").replace(/\s+/g, " ");
  if (compact.length <= 28) return compact;
  const words = compact.split(" ");
  let shortened = "";
  for (const word of words) {
    const candidate = shortened ? `${shortened} ${word}` : word;
    if (candidate.length > 28) break;
    shortened = candidate;
  }
  return shortened || `${compact.slice(0, 27).trimEnd()}…`;
}
