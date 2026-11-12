# Step 03 — Homepage features and class pathways

This increment restyles the existing homepage benefits and class-range cards. It does not complete the broader visual overhaul.

- Benefit cards use distinct education-icon accents and a compact mobile layout. Class cards emphasize the existing grade ranges and link to the same Courses page as before. Repeated class-summary text was removed from the individual cards; the existing summary remains above them.
- Existing Bangla and English copy, four feature descriptions, class ranges, links and underlying behavior are retained. No routes, business rules, database models or translations were changed for this increment. The feature statements are existing site copy, not newly verified claims.
- Reduced-motion users do not receive card hover movement. Section styles are scoped to the homepage.
- Typecheck and all 17 unit suites passed, as did the existing UX suite. Focused checks passed for 360, 768 and 1440 pixels in Bangla and English, including no horizontal overflow, existing course destinations and a no-JavaScript course link.
- Review images are crops of full-page screenshots at 360px and 1440px, taken with reduced motion; sticky viewport controls appear in the live preview rather than within these section crops.
- Step 02's local mobile Lighthouse median of 79/100 remains below the 90+ target. Performance was not remeasured for this increment, so that earlier result should not be treated as a current score.
