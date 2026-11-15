# Android master database

Holodori master data for all six client languages in one repository.

## Data

- `manifest.json`: master version, contract `app.versionCode` and display
  `versionName`, languages, table paths and counts.
- `tables/<Table>.json`: shared data, stored once.
- `languages/<language>/<Table>.json`: localized data for `jpn`, `eng`, `ind`,
  `kor`, `cht`, and `chs`.
- `report.json`: execution results, Node version/image, and tool/contract commits.
  The contract revision records the source snapshot used to build the database.

The K3s checker looks for a new master version or contract `app.versionCode`
at 15 and 45 minutes past each hour in `Asia/Taipei` and dispatches the update
workflow when either value changes. The workflow can also be started with
`workflow_dispatch`. Contract `versionName` is for display; the contract SHA
pins the input snapshot and supports source tracking. Set `force` to rebuild
when both version values are unchanged.

Each table is a readable JSON array. For example, `tables/Card.json` contains
shared cards and `languages/cht/LangCard.json` contains Traditional Chinese text.
Use the file list in `manifest.json` to discover the current tables.

## SQLite

Download `master.sqlite` from the [release matching the data tag](https://github.com/holodori-net/android-database/releases).
Shared datasets use one table each. Localized datasets share a table with a
`language` column, such as `LangCard`.

64-bit integer fields are stored as decimal text to preserve precision. Nested,
repeated, and map fields are stored as JSON text. Schema and relationship
metadata are available in `logical_tables`, `logical_fields`, and
`declared_foreign_keys`.

## Frontend deployment notification

After a successful publication to `main`, the `update.yml` workflow starts a
separate `notify` job only when the publication action reports `published=true`.
It runs after the SQLite release asset has finished uploading. No-change runs
and publications to other branches do not notify frontend.

The job dispatches `holodori-net/frontend`'s `deploy-pages.yml` on `main`, passing
the exact database release tag, publication commit, and report SHA-256. Frontend
verifies those inputs before building and records them in `/version.json`.

Configure `FRONTEND_APP_ID` as a repository Actions variable and
`FRONTEND_APP_PRIVATE_KEY` as an Actions secret. The notification resolves the
App installation on frontend automatically. Use a dedicated private organization-owned App with webhook delivery disabled,
installed only on frontend, with Actions write (and GitHub's required Metadata
read). Do not reuse the K3s updater App. Each notification mints
a short-lived installation token restricted to the `frontend` repository and
Actions write, then revokes it after the dispatch attempt. No package dependencies
are installed by the notification script. Run its tests with Node.js 24+:

```sh
node --test .github/scripts/notify-frontend.test.ts
```

Notification errors fail the separate job without undoing database publication.
Dispatch writes are not automatically retried: if the response is uncertain,
check frontend Actions before rerunning the failed `notify` job. A dispatch
receipt identifies the downstream workflow run; it does not prove deployment
success. Check that run and the site's `/version.json` to verify delivery.
If a newer database release or frontend commit has superseded a build, frontend
skips its deployment. A normal unchanged-data run does not replay notifications;
use a failed-job rerun, or manually dispatch frontend with the latest release tag.
