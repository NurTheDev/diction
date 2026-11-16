import {z} from 'zod';

/**
 * The Recycle Bin vocabulary, kept free of any server-only import so client components can use it
 * (the registry itself lives in `src/lib/admin/recycle.ts`, which pulls in Mongoose models).
 * `tests/recycle-coverage.test.ts` asserts these lists match the registry exactly.
 *
 * The form-input schema lives here too, on purpose: `src/actions/recycle.ts` is a 'use server'
 * file, and Next only allows async functions to be exported from one — exporting this schema from
 * there broke every server action at runtime (CI runs 43274692208, twice).
 */
export const recycleKinds=['editorial','course','material','media','portalNotice','faq','facility','achievementRecord','practiceTest','publicSheet','classGroup','centerExam','slot','trialBooking','admission','contactMessage','heroBanner','teacher','portalAccount','exam','modelTest','lead','teacherCandidate'] as const;
export type RecycleKind=typeof recycleKinds[number];

/**
 * Kinds whose "archive instead of delete" is a field write (unpublish, draft, deactivate). Media
 * has no archive path — an image is either referenced or it is not — and a Center exam is archived
 * by withdrawing its results, which is a separate workflow, so neither appears here. A teacher CV
 * (R4) has no published state to fall back on either: it is a private record, so it joins the bin
 * without joining this list, and the statuses it does carry are the operator's own reading of it.
 */
export const archivableKinds=['editorial','course','material','portalNotice','faq','facility','achievementRecord','practiceTest','publicSheet','classGroup','slot','heroBanner','teacher','portalAccount','exam','modelTest'] as const;

export function canArchiveKind(kind:RecycleKind):boolean{
  return (archivableKinds as readonly string[]).includes(kind);
}

/** What the server actions accept as a kind — derived, never hand-copied (see R1 second wave). */
export const kindSchema=z.enum(recycleKinds);
