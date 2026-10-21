export const queryKeys = {
  kits: ["kits"] as const,
  kit: (id: string) => ["kits", id] as const,
  kitData: (kitId: string) => ["kitData", kitId] as const,
  generation: (kitId: string) => ["generation", kitId] as const,
  scheduleProgress: (kitId: string) => ["scheduleProgress", kitId] as const,
  practiceSessions: (kitId: string) => ["practiceSessions", kitId] as const,
  checklist: (kitId: string) => ["checklist", kitId] as const,
  questions: (kitId: string) => ["questions", kitId] as const,
};
