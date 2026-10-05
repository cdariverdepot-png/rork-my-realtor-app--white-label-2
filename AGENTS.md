# Importer maintenance

For listing import work, read `docs/importer-compatibility-engine.md` and preserve the executable strategy registry and permanent replay corpus.

- Solve architectural contracts, not customer domains. Explain the structural signal, request scope, identity boundary and why the solution works.
- Reuse existing readers across compatible platforms and widgets. Customer URLs belong in fixtures; provider transport host checks may be necessary.
- Capture every newly solved public site with `npm run audit:compatibility -- --url URL --name NAME` from `expo`. Review the resulting facts and scope before committing its immutable replay case.
- Add a successful fixture for each strategy, portability coverage, and applicable negative cases. Clearly distinguish live responses from synthetic contracts.
- Preserve older cases. Do not regenerate old expected output just to make a failing test pass.
- Run `npm test` from `expo` before completion; deployment workflows also require the regression suite. Report remote access failures separately from parser regressions.
- Unknown or blocked pages and partial showcases must not become evidence of complete inventory or justify disappearance-based archiving.
