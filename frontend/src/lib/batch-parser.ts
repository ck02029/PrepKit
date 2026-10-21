export type BatchRow = { id: string; role?: string; company?: string; jd: string; companyUrl: string; days: number; expectedRounds?: string; completedRounds?: string; currentRound?: string; checked: boolean };

export function parseBatchCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && text[index + 1] === '"' && quoted) { current += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(current); current = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(current); if (row.some((cell) => cell.trim())) rows.push(row); row = []; current = "";
    } else current += char;
  }
  row.push(current); if (row.some((cell) => cell.trim())) rows.push(row);
  const [header = [], ...body] = rows;
  return body.map((values) => Object.fromEntries(header.map((key, index) => [key.trim().toLowerCase(), values[index] ?? ""])));
}

export function getBatchRowIssues(row: BatchRow): string[] {
  const problems: string[] = [];
  if (!row.role?.trim()) problems.push("Role title is required");
  if (row.company !== undefined && !row.company.trim()) problems.push("Company name is required");
  if (!row.jd.trim()) problems.push("Job description is required");
  if (row.companyUrl.trim()) {
    try {
      const url = new URL(row.companyUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") problems.push("URL must use http(s)");
    } catch {
      problems.push("Company URL must be valid");
    }
  }
  if (!Number.isInteger(row.days) || row.days < 1 || row.days > 60) problems.push("Days must be 1–60");
  if (row.expectedRounds?.trim()) {
    const expected = Number(row.expectedRounds);
    if (!Number.isInteger(expected) || expected < 1 || expected > 20) problems.push("Expected rounds must be 1–20");
  }
  return problems;
}
