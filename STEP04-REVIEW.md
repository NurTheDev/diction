# Step 04 — Public page mastheads and About

This increment refreshes the shared public-page masthead and the About page, not the entire website.

- Twelve existing public pages use the refreshed illustrated masthead, with the same titles, descriptions and breadcrumb destinations. Existing page-hero styling also provides a consistent background for other public page headers.
- The About story and mission, vision and director cards have been restyled using existing Bangla/English content. No routes, business logic, database models, translations or biographical claims were changed.
- The About image is a new AI-generated, visibly stylized illustration of a study desk, **not a photograph of the institution or its staff**. It is decorative and delivered locally, and does not claim to depict actual students or a real classroom.
- The existing 2011 founding statement is shown as a single year marker. No additional timeline milestones or dates have been invented; a fuller timeline needs verified, appropriately editable information.
- Typecheck and all 17 unit suites passed. The general UX suite passed after restarting the local server following a concurrency-related interruption. Focused browser checks covered 12 public page headers in both languages at 360, 768, 900, 1100 and 1440 pixels, checking overflow, text/art separation and breadcrumbs; an About link also passed with JavaScript disabled.
- Review images include an actual 360px viewport. To show whole sections without obstruction, the longer section images are full-page crops captured with sticky navigation and contact controls hidden; those controls remain in the live preview.
- The Step 02 local mobile Lighthouse median of 79/100 was below the requested 90+ target. Performance was not remeasured for this increment, so the earlier result is not a current score.
