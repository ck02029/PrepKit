export type PracticeItem = {
  id: string;
  confidence?: number;
  priority: "must" | "nice";
  originalOrder: number;
};

export function orderPracticeItems<T extends PracticeItem>(items: T[]): T[] {
  return [...items].sort((first, second) => {
    const firstUnseen = first.confidence === undefined;
    const secondUnseen = second.confidence === undefined;
    if (firstUnseen !== secondUnseen) return firstUnseen ? -1 : 1;
    if (first.confidence !== second.confidence) return (first.confidence ?? 0) - (second.confidence ?? 0);
    if (first.priority !== second.priority) return first.priority === "must" ? -1 : 1;
    return first.originalOrder - second.originalOrder;
  });
}
