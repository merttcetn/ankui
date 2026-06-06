## Summary

<!-- What does this PR do? One or two sentences. -->

## Type of change

- [ ] New adapter (`src/scanner/adapters/`)
- [ ] Bug fix
- [ ] New feature / CLI flag
- [ ] Refactor / internal cleanup
- [ ] Docs

## Scanner invariants

<!-- If this PR touches the scanner (any adapter or safety code), confirm: -->

- [ ] All disk I/O goes through `safeReadOptions(filePath, context)` from `src/scanner/adapters/shared.ts` — no direct `fs.readFile` / `fs.readdir`
- [ ] Failures (timeout, parse error, missing config, sensitive file) produce a `Warning` instead of throwing
- [ ] Respects the 1 MB file size cap (`MAX_SAFE_FILE_BYTES`) and the 1-second per-adapter time budget
- [ ] Markdown-backed skill paths call `await buildLinkDetails(filePath, context)` so symlink metadata (`linked`, `linkTarget`) is recorded on every skill
- [ ] New adapters are registered in `src/scanner/adapters/index.ts`

## Validation

- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] `npm run typecheck` passes
- [ ] Ran against a real local config (not just synthetic temp-workspace tests):

  ```bash
  node dist/cli.js scan
  node dist/cli.js scan --json | jq '.tools[] | {id, skills: (.skills|length)}'
  ```

  <!-- One-line note on what you observed, e.g.
       "Claude reported ~82 agent skills, ~46 linked"
       "Gemini extensions list contains: frontend-design, superpowers, ..." -->

## Notes

<!-- Anything reviewers should know: tradeoffs, follow-ups, screenshots, etc. -->
