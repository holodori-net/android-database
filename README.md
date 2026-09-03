# Android master database

Holodori master data for all six client languages in one repository.

## Data

- `manifest.json`: master version, app version, languages, table paths and counts.
- `tables/<Table>.json`: shared data, stored once.
- `languages/<language>/<Table>.json`: localized data for `jpn`, `eng`, `ind`,
  `kor`, `cht`, and `chs`.
- `report.json`: execution results, Node version/image, and tool/contract commits.

Each table is a readable JSON array. For example, `tables/Card.json` contains
shared cards and `languages/cht/LangCard.json` contains Traditional Chinese text.
Use the file list in `manifest.json` to discover the current tables.
