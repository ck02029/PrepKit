export type RequirementWithQuote<T> = T & { quote: string };

/** Rejects unsupported evidence instead of accepting model-invented citations. */
export function keepRequirementsWithExactQuotes<T extends { quote: string }>(rows: T[], jobDescription: string): RequirementWithQuote<T>[] {
  return rows.filter((row) => row.quote.trim().length > 0 && jobDescription.includes(row.quote.trim()));
}
