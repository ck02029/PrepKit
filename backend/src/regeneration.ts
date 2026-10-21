type Preservable = { id: string; origin?: "generated" | "edited" | "pinned" | "user"; [key: string]: unknown };
const manualOrigins = new Set(["edited", "pinned", "user"]);

export function mergeRegeneratedItems<T extends Preservable>(previous: T[], generated: T[], archived: T[] = []) {
  const generatedById = new Map(generated.map((item) => [item.id, item]));
  const active = new Map(generated.map((item) => [item.id, item]));
  const oldArchived = new Map(archived.map((item) => [item.id, item]));
  const currentIds = new Set(generated.map((item) => item.id));

  for (const item of previous) {
    if (currentIds.has(item.id)) {
      if (manualOrigins.has(item.origin ?? "")) active.set(item.id, item);
      oldArchived.delete(item.id);
    } else if (manualOrigins.has(item.origin ?? "")) {
      active.set(item.id, item);
      oldArchived.delete(item.id);
    } else {
      oldArchived.set(item.id, item);
    }
  }

  return { active: [...active.values()], archived: [...oldArchived.values()] };
}

export function mergeRegeneratedCategory<T extends Preservable & { category: string }>(previous: T[], generated: T[], category: string, archived: T[] = []) {
  const replacement = generated.filter((item) => item.category === category);
  const keptDrafts = previous.filter((item) => item.category === category && item.origin === "generated");
  const untouchedCategories = previous.filter((item) => item.category !== category);
  return mergeRegeneratedItems(previous, [...untouchedCategories, ...(replacement.length ? replacement : keptDrafts)], archived);
}
