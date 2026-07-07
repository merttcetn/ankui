# Security Policy

## Supported Versions

The latest released version of Ankui is supported for security fixes. Older versions may receive fixes at maintainer discretion, but users should upgrade to the latest release before reporting issues that may already be fixed.

## Scope

This repository contains the public open-source Ankui community edition: a local, single-device, local-first scanner/UI for inspecting AI coding tool configuration on a user's own machine.

This repository does not include a hosted control plane, centralized org inventory, endpoint fleet management, remote policy management, centralized audit/evidence retention, SSO, SIEM integrations, or runtime enforcement.

## Safety model

Ankui is an inventory and review tool, not a security boundary or enforcement agent.

- Scans are read-only. Writes require an explicit user action and are limited to Ankui-owned settings/bundles/snapshots or a confirmed reversible skill enable/disable action.
- Skill enable/disable moves a markdown-backed skill directory into or out of a sibling `.disabled/` directory. It is refused if the source is missing, the target exists, or the rename would leave the allowed `$HOME`/`$CWD` roots.
- Scanner reads go through the safety layer, which skips sensitive paths, caps file reads at 1 MB, records warnings instead of throwing on ordinary filesystem failures, and masks secret-like values in returned scan data.
- The local web UI binds to loopback, requires a per-session token for API requests, requires same-origin writes, and rejects non-loopback `Host` headers.
- Ankui sends no scan data, telemetry, customer data, secrets, or local inventory to a hosted service from this repository.

## Reporting a vulnerability

Please do not disclose vulnerabilities in public GitHub issues.

Use GitHub Private Vulnerability Reporting / GitHub Security Advisory for this repository if it is enabled. If that private path is not available, open a minimal public issue asking for a private contact path, without exploit details, secrets, local paths, or private configuration.

Useful reports include:

- Affected Ankui version or commit.
- Operating system and Node.js version.
- Exact command or UI path used.
- Minimal reproduction steps using synthetic paths and fake secrets.
- Expected and actual impact.
- Proof-of-concept details that avoid real secrets, private paths, customer data, or confidential configuration.
- Why the behavior crosses the safety model above.

Maintainers aim to acknowledge private vulnerability reports within 7 days. This is a target, not a guaranteed SLA.

## In scope examples

Relevant security reports include:

- Reading sensitive files or sensitive directories that should be skipped.
- Secret masking bypasses in scan output, web output, or CLI/TUI rendering.
- Symlink or path traversal bypasses.
- Unsafe filesystem mutation through skill enable/disable actions.
- Localhost web server exposure beyond loopback.
- Localhost CSRF or DNS rebinding bypasses.
- Unexpected outbound network calls from this repository's scanner, CLI, TUI, or local web UI.
- Arbitrary code execution through scanned configuration, skills, rules, MCP definitions, or local web routes.

## Out of scope

These are usually not Ankui security vulnerabilities:

- Findings about third-party AI tools, MCP servers, skills, plugins, or rules that Ankui merely reports.
- A local user with filesystem permissions manually changing Ankui's files or config.
- Social engineering, phishing, or malicious packages unrelated to this repository.
- Requests for hosted administration, centralized retention, fleet policy, SSO, SIEM, or runtime blocking features.

## Licensing

The MIT license remains unchanged. Do not add a CLA, DCO, alternate license requirement, telemetry service, hosted service, pricing terms, or proprietary implementation detail to security process changes.
