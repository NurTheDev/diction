# Diction project — test instructions

For staff permissions and multimedia publishing, see `ADMIN-ROLES-AND-CONTENT.md`.

This is a testing build, **not a production-ready release**. Before using real student information, resolve the blockers in `PRODUCTION-READINESS-STATUS.md` and `ACHIEVEMENT-WORKFLOW.md`.

Use Node.js 22.13 or newer. Extract the ZIP and run in the folder containing `package.json`:

```sh
npm ci
PREVIEW_WITHOUT_SERVICES=1 npm run dev
```

On Windows PowerShell, use `$env:PREVIEW_WITHOUT_SERVICES='1'; npm run dev` for the second line. Open `http://localhost:3000/bn` for the website, and `http://localhost:3000/bn/achievement-preview` for the card-design preview. The local preview does not connect to real services or allow saving/publishing. Illustrations and sample names are not actual students or achievements.

The protected admin and achievement workflow require a configured database and environment. See `ACHIEVEMENT-WORKFLOW.md` and `DEPLOYMENT.md`. The feature and collection flags default off. Do not enter credentials in chat or commit `.env.local`. The general public-media uploader makes assets public immediately, even for draft forms; never use it for private documents or minor photos.

## Checks

Run `npm run typecheck` and `npm test`. To test the achievement workflow with an isolated test database and browser, follow `ACHIEVEMENT-WORKFLOW.md`. A webpack production build and that focused synthetic integration test passed in the development environment. The entire-site integration rerun did not complete under sandbox resource limits. Live services, production deployment and security are not verified.
