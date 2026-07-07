# Contributing to Ankui

Ankui is a local-first scanner/UI for inspecting AI coding tool configuration. Contributions should keep the public repository focused on the local, single-device community edition.

## Repository boundary

This repository contains the local scanner, CLI, TUI, and local web UI. It does not include a hosted control plane, centralized org inventory, endpoint fleet management, remote policy management, centralized audit/evidence retention, SSO, SIEM integrations, or runtime enforcement.

Do not add enterprise, cloud, telemetry, customer-data, pricing, proprietary architecture, or commercial-plan content to this repository.

## Development setup

Requires Node.js >= 20.

```bash
npm install
npm run typecheck
npm test
npm run build
node dist/cli.js scan
```

Use `npm run dev` for the CLI entrypoint and `npm run dev:web` for the Vite web UI during frontend work.

## Safety invariants

Keep these invariants intact unless the code change and tests prove a stronger safety model:

- Scans are read-only. Writes require an explicit user action and are limited to Ankui-owned settings/bundles/snapshots or a confirmed reversible skill enable/disable action.
- Scanner adapters must use the shared safe read helpers instead of direct filesystem reads.
- Sensitive files and directories must be skipped, not partially parsed.
- Secret-like values must be masked before scan data is returned or rendered.
- Ordinary filesystem failures should produce warnings, not crashes.
- The local web UI must stay loopback-only and must keep token, Origin, and Host protections on API routes.
- Skill enable/disable must remain limited to eligible markdown-backed user-scope skills and must never delete, overwrite, or move outside allowed roots.

## Pull requests

Open an issue when you have a bug report, a safety concern, or a larger feature proposal that needs design discussion before implementation. Small fixes can go straight to a pull request with a clear summary and validation notes.

Before opening a PR:

- Keep changes narrowly scoped and include tests for behavior changes.
- Run `npm run typecheck`, `npm test`, and `npm run build` when applicable.
- Update README or policy docs when user-visible behavior, safety wording, or contribution workflow changes.
- Only submit code, documentation, test data, and assets that you have the right to contribute.
- Do not include real secrets, private local paths, customer data, employer/client code, screenshots with sensitive data, or generated scan output from private machines.
- Do not include employer, client, customer, credential, secret, or confidential material.
- Do not add customer-specific integrations, telemetry, hosted service code, secrets, or proprietary commercial components to this public repository.
- Do not introduce a CLA, DCO, telemetry service, hosted service, pricing language, proprietary commercial component, or alternate license.

Contributions are submitted under this repository's MIT license. The existing MIT license remains unchanged.

## Documentation style

Be concrete and conservative. Describe what the code does today. Do not promise future products, dates, pricing, roadmap commitments, proprietary implementation details, or commercial plans.

When describing safety, use wording consistent with:

```text
Scans are read-only. Writes require an explicit user action and are limited to Ankui-owned settings/bundles/snapshots or a confirmed reversible skill enable/disable action.
```
