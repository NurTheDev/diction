# Step 05 — Courses finder and cards

This increment refreshes the existing Courses page filter and card presentation. The broader visual overhaul remains in progress.

- Native class and subject selects retain the same options and filtering behavior, including the approved hero-to-Courses initial selections. Cards have subject icons and responsive layouts; published course schedule and fee details appear only when provided by the existing course data.
- The service-free preview displays the existing general subject guide and its explanatory notice, not verified course availability, fees or schedules. Configured sites continue to display published courses, no-match messaging, or the existing error state as appropriate. No course claims or prices were fabricated.
- No routes, business logic, database models or translation files were changed. Existing contact and admission links are retained. Reduced-motion users do not receive card hover movement.
- Typecheck, all 17 unit suites and the general UX suite passed. Focused service-free checks covered Bangla and English at 360, 768 and 1440 pixels, including filters and URL-initialized no-JavaScript rendering.
- A targeted isolated production build with an ephemeral database and synthetic test-only records passed published/draft visibility, both filters, optional schedule/fee fields, empty results, and no-JavaScript initial filters. This was not the full integration suite or a live database test.
- Review images show an actual 360px viewport and full-page section crops with sticky controls hidden for readability; the controls remain in the live preview. All pictured course cards are explicitly labeled as the general guide.
- The Step 02 local mobile Lighthouse median of 79/100 was below the requested 90+ target. Performance was not remeasured for this increment, so the earlier result is not a current score.
