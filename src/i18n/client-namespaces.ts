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
export const SERVER_ONLY_NAMESPACES=['aiPublic','aiSetup','audit','classes','cta','features','footer','hero','history','seo','stats'] as const;

/** Drop the groups no client component can read, keeping every other group exactly as it is. */
export function clientMessages<T extends Record<string,unknown>>(messages:T):T{
  const out:Record<string,unknown>={};
  for(const group of Object.keys(messages))if(!(SERVER_ONLY_NAMESPACES as readonly string[]).includes(group))out[group]=messages[group];
  return out as T;
}
