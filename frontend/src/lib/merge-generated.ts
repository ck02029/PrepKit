export type OriginItem = { origin: "generated" | "edited" | "pinned" | "user" };

export function mergeGeneratedItems<T extends OriginItem>(current: T[], incoming: T[]): T[] {
  const next = [...current];
  let incomingIndex = 0;
  const merged: T[] = [];
  for (let index = 0; index < next.length; index += 1) {
    if (next[index].origin !== "generated") merged.push(next[index]);
    else if (incomingIndex < incoming.length) merged.push(incoming[incomingIndex++]);
  }
  return [...merged, ...incoming.slice(incomingIndex)];
}
