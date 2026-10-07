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
