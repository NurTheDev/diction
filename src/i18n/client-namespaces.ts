/* Which catalog groups may reach the browser, and which must not.

   A server component reads the catalog with `getTranslations` and paints on the server, so a group
   only servers read never has to be sent to the client — and must not be, because the flight payload
   is part of the page's HTML. `aiSetup` decided this: it is the deployment checklist, it names
   GEMINI_API_KEY, AI_MODEL, AI_STUDY_BUDDY_ENABLED and DATA_COLLECTION_ENABLED, and the admin layout
   used to hand the whole catalog to `NextIntlClientProvider`, so those four names were in the HTML of
   every admin page (R2.7). The AI setup screen still says them, in the server-rendered page that is
   about them; the rest of the admin does not carry them.

   This is the complement of what client components read, which is why it is safe to subtract rather
   than to enumerate what the admin needs: nothing in this list has a `useTranslations` in a
   `'use client'` file anywhere in src/. `tests/i18n-catalog.test.ts` keeps that true — it walks src/
   and fails if a client component starts reading a group listed here, if a layout ships the catalog
   without this filter, or if a group that IS shipped names an environment variable. */
export const SERVER_ONLY_NAMESPACES=['aiPublic','aiSetup','audit','classes','cta','features','footer','hero','history','importNotes','seo','stats'] as const;

/**
 * Ship exactly these groups and no others — the tightest filter there is, for a route that renders one
 * client component and must not carry the rest of the catalog in its payload. `clientMessages` subtracts
 * what no client can read, which is the right answer inside the admin tree where the shell reads dozens
 * of groups; outside it a page should name what it ships, because everything else in the catalog is
 * somebody else's copy. A teacher's exam screen is the case that made this exist: the grid reads `exams`
 * alone, and the groups it does not read include the fees and dues vocabulary the wall around a teacher's
 * eyes is built to keep off that screen — including out of the bytes behind the visible ones.
 */
export function pickedMessages<T extends Record<string,unknown>>(messages:T,pick:readonly string[]):T{
  const out:Record<string,unknown>={};
  for(const group of pick)if(group in messages)out[group]=messages[group];
  return out as T;
}

/**
 * The groups the public site's own client components read — the header, the course and editorial screens,
 * the study and practice tools, the public forms. `src/app/[locale]/layout.tsx` ships exactly these and
 * nothing else, so a public page carries no admin copy in its payload, and a portal tree that needs one
 * more group says so on its own page rather than widening every address on the site.
 *
 * `practicePublic` is here because the two screens that read it are public: `/practice-tests/[slug]` needs
 * no session at all, and the practice history in the student dashboard renders the same client component.
 * It is two keys, and until it was shipped both screens painted `practicePublic.exam.start` where a
 * sentence belongs — a defect no build, type check or server test can see.
 */
export const PUBLIC_NAMESPACES=['nav','pages','quickChat','courseCms','channelVideo','editorial','forms','recovery','study','academic','modelTest','fees','portalNotices','materials','common','splash','publicPages','practicePublic'] as const;

/** Drop the groups no client component can read, keeping every other group exactly as it is. */
export function clientMessages<T extends Record<string,unknown>>(messages:T):T{
  const out:Record<string,unknown>={};
  for(const group of Object.keys(messages))if(!(SERVER_ONLY_NAMESPACES as readonly string[]).includes(group))out[group]=messages[group];
  return out as T;
}
