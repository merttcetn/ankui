# Changelog

All notable changes to Ankui will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added public repository boundary documentation, security reporting policy, contribution guidance, and brand usage policy.
- Added CI checks for Node 20 and 22, Dependabot configuration for npm and GitHub Actions, and CODEOWNERS ownership for all paths.

### Changed

- Linked the README to the hosted Ankui landing page.
- Clarified read-only wording so scans remain read-only while the optional confirmed skill enable/disable action is described as reversible.
- Expanded the pull request template with provenance, safety/privacy, and test reminders.

## [0.2.3] - 2026-06-06

### Changed

- Released package metadata for the current canonical `0.2.3` version.

## [0.2.2] - 2026-06-06

### Fixed

- Clipped TUI tab content to the terminal height so sidebar navigation no longer leaves stacked frames behind.

### Changed

- Adjusted tagged-release provenance behavior for public source repositories.
- Added a scanner-invariant checklist to the pull request template.

## [0.2.1] - 2026-06-06

### Fixed

- Recovered Claude-flavored frontmatter through a more permissive scanner fallback.
- Corrected npm publish automation by removing an incompatible provenance flag and upgrading npm before trusted publishing.

### Added

- Added tagged-release workflow automation for npm trusted publishing.

## [0.2.0] - 2026-06-06

### Added

- Added the `ankui web` browser UI with Overview, Tools, MCPs, Access, Doctor, Actions, and Settings views.
- Added a loopback-only web server, static app serving, browser launcher, token checks, origin checks, and local action APIs.
- Added bundle management commands for adding, listing, updating, and removing tracked bundles, plus detected-bundle visibility.
- Added bundle origin metadata across scanner results, TUI rows, web groups, and integrity warnings.
- Added Antigravity support and broader multi-project scanning, first-run setup, watch-mode rescans, and dev-root settings.

### Changed

- Redesigned the TUI and web UI around sidebar/detail layouts, searchable views, grouped rows, responsive panels, and clearer status components.
- Replaced the web UI design tokens with an editorial palette, Plus Jakarta Sans, responsive breakpoints, and shared UI primitives.
- Removed unused ripgrep-based discovery after scanner paths moved to local filesystem crawling.

### Fixed

- Hardened the web API path, port, Origin, and loopback validation while preserving scan warnings.
- Fixed web action pending-state reconciliation, viewport overflow, tab animation layout issues, and long-name truncation in TUI drill-ins.
- Treated empty Antigravity `mcp_config.json` files as empty objects instead of warnings.

## [0.1.2] - 2026-05-19

### Added

- Added staged skill enable/disable flows in the TUI, including save handling, session summaries, and built-in default visibility.
- Added scanner support for markdown skill trees that include `.disabled/` directories.

### Changed

- Refined Actions-tab key hints, hotkeys, and footer behavior for bounded TUI navigation.

### Fixed

- Kept the TUI shell in sync when scan results rerender.
- Routed Actions-tab disable/enable hotkeys through text input handling to avoid input conflicts.

## [0.1.0] - 2026-05-18

### Added

- First npm release of Ankui as a local-first TUI/CLI for inspecting AI coding tool configurations.
- Added scanner adapters for Claude, Codex, Cursor, Gemini, OpenCode, and skills.sh.
- Added CLI commands for listing tools, showing per-tool detail, reviewing MCPs, access findings, capability categories, and doctor warnings.
- Added capability mapping, access finding aggregation, config discovery, URL credential masking, and safe symlink handling.
- Added an Ink-based terminal UI with tabs for overview, MCPs, access, doctor, settings, first-run setup, search, scan history, and live rescans.
- Added project/dev-root scanning support and a watch command for refreshing local inventory.

### Fixed

- Normalized the package binary path for npm publication.
- Improved TUI frame sizing and first-run launch behavior before the initial package release.

[Unreleased]: https://github.com/merttcetn/ankui/compare/v0.2.3...HEAD
[0.2.3]: https://github.com/merttcetn/ankui/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/merttcetn/ankui/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/merttcetn/ankui/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/merttcetn/ankui/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/merttcetn/ankui/compare/v0.1.0...v0.1.2
[0.1.0]: https://github.com/merttcetn/ankui/releases/tag/v0.1.0
