type Preservable = { id: string; origin?: "generated" | "edited" | "pinned" | "user"; [key: string]: unknown };
const manualOrigins = new Set(["edited", "pinned", "user"]);

const questionStopWords = new Set("a an and are as at be by can could describe did do does for from have how in into is it of on or tell that the their them then this to was what when where which who why with would your project system experience time".split(" "));

export function isNovelQuestion(prompt: string, existingPrompts: string[]) {
  const tokens = (value: string) => new Set((value.toLowerCase().normalize("NFKC").match(/[a-z0-9]+/g) ?? []).map((word) => word.replace(/ies$/, "y").replace(/s$/, "")).filter((word) => word.length > 2 && !questionStopWords.has(word)));
  const candidate = tokens(prompt);
  if (!candidate.size) return false;
  return existingPrompts.every((existing) => {
    const prior = tokens(existing);
    if (!prior.size) return true;
    const intersection = [...candidate].filter((word) => prior.has(word)).length;
    const jaccard = intersection / (candidate.size + prior.size - intersection);
    const containment = intersection / Math.min(candidate.size, prior.size);
    return jaccard < 0.72 && !(Math.min(candidate.size, prior.size) >= 5 && containment >= 0.88);
  });
}

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
