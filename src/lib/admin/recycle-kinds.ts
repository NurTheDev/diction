/**
 * The Recycle Bin vocabulary, kept free of any server-only import so client components can use it
 * (the registry itself lives in `src/lib/admin/recycle.ts`, which pulls in Mongoose models).
 * `tests/recycle-coverage.test.ts` asserts these lists match the registry exactly.
 */
export const recycleKinds=['editorial','course','material','media','portalNotice','faq','facility','achievementRecord','practiceTest','publicSheet','classGroup','centerExam'] as const;
export type RecycleKind=typeof recycleKinds[number];

/**
 * Kinds whose "archive instead of delete" is a field write (unpublish, draft, deactivate). Media
 * has no archive path — an image is either referenced or it is not — and a Center exam is archived
 * by withdrawing its results, which is a separate workflow, so neither appears here.
 */
export const archivableKinds=['editorial','course','material','portalNotice','faq','facility','achievementRecord','practiceTest','publicSheet','classGroup'] as const;

export function canArchiveKind(kind:RecycleKind):boolean{
  return (archivableKinds as readonly string[]).includes(kind);
}
