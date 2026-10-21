import { stableId } from "./identifiers.js";

export type EvidenceDocument = { id: string; url: string; title: string; sourceType: string; content: string };
export type EvidenceChunk = { id: string; sourceId: string; url: string; title: string; sourceType: string; ordinal: number; text: string };

const stopWords = new Set("a an and are as at be by for from how in into is it of on or that the their this to was what when where which with your role company interview job".split(" "));
const terms = (value: string) => value.toLowerCase().match(/[a-z0-9+#.]{2,}/g)?.filter((term) => !stopWords.has(term)) ?? [];

/** Split large sources into stable, overlapping passages so generation can reuse citations. */
export function chunkEvidence(kitId: string, documents: EvidenceDocument[], chunkSize = 1400, overlap = 180): EvidenceChunk[] {
  if (!Number.isInteger(chunkSize) || chunkSize < 200 || !Number.isInteger(overlap) || overlap < 0 || overlap >= chunkSize) {
    throw new RangeError("Evidence chunk size or overlap is invalid.");
  }
  const chunks: EvidenceChunk[] = [];
  for (const document of documents) {
    const text = document.content.replace(/\s+/g, " ").trim();
    let start = 0;
    let ordinal = 0;
    while (start < text.length) {
      let end = Math.min(text.length, start + chunkSize);
      if (end < text.length) {
        const sentenceEnd = text.lastIndexOf(". ", end);
        if (sentenceEnd > start + Math.floor(chunkSize * 0.6)) end = sentenceEnd + 1;
      }
      const passage = text.slice(start, end).trim();
      if (passage) chunks.push({
        id: stableId(kitId, "evidence_chunk", `${document.id}:${ordinal}`),
        sourceId: document.id, url: document.url, title: document.title, sourceType: document.sourceType, ordinal, text: passage,
      });
      if (end >= text.length) break;
      start = Math.max(start + 1, end - overlap);
      ordinal++;
    }
  }
  return chunks;
}

/** Deterministic IDF retrieval with a modest boost for interview-report evidence. */
export function retrieveEvidence(chunks: EvidenceChunk[], query: string, limit = 6): EvidenceChunk[] {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("Evidence retrieval limit must be positive.");
  const queryTerms = [...new Set(terms(query))];
  if (!queryTerms.length) return chunks.slice(0, limit);
  const documents = new Set(chunks.map((chunk) => chunk.sourceId));
  const documentFrequency = new Map<string, Set<string>>();
  for (const chunk of chunks) {
    for (const term of new Set(terms(chunk.text))) {
      const sources = documentFrequency.get(term) ?? new Set<string>();
      sources.add(chunk.sourceId);
      documentFrequency.set(term, sources);
    }
  }
  return chunks.map((chunk, index) => {
    const text = chunk.text.toLowerCase();
    const chunkTerms = terms(chunk.text);
    const frequencies = new Map<string, number>();
    for (const term of chunkTerms) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
    const lengthNorm = 0.75 + 0.25 * Math.min(2, chunkTerms.length / 180);
    const lexical = queryTerms.reduce((sum, term) => {
      const frequency = frequencies.get(term) ?? 0;
      if (!frequency) return sum;
      const idf = Math.log(1 + documents.size / (documentFrequency.get(term)?.size ?? 1));
      return sum + idf * (1 + Math.log(frequency)) / lengthNorm;
    }, 0);
    const reportBoost = /interview|report|discussion/i.test(chunk.sourceType) ? 1.2 : 1;
    const boilerplatePenalty = /^(home|menu|navigation|footer|privacy policy)\b/i.test(chunk.title.trim()) ? 0.55 : 1;
    const score = lexical * reportBoost * boilerplatePenalty + (text.includes(query.toLowerCase().trim()) ? 1 : 0);
    return { chunk, index, score };
  }).filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit).map((item) => item.chunk);
}
