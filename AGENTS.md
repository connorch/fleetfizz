# fleetfizz

## Repo shape

- `apps/cli`: the `fizz` CLI
- `apps/website`: fleetfizz.com and its docs
- `packages/*`: shared tooling and logic composability
- `skills/fleetfizz`: the skill users install so their agents can drive `fizz`, not guidance for working in this repo

## Guardrails

- Match existing package boundaries and conventions before inventing new ones
- One job per module, not a line limit. If you can't state a module's job in one sentence without "and", it has two. Put new code where its job lives, or start a new module. Never split cohesive code for length or create `utils`/`helpers` grab bags.
- Generally prefer full unabbreviated variable names (ex: "member" instead of "m")
- Name things with the terms in `CONTEXT.md`, never the words its _Avoid_ lists name. Avoid metaphorical labels such as `anchored` or `stamped` when a literal name is available.
- Add succinct JSDoc comments above important, non-obvious functions. Comments should explain intent and invariants, not restate the function name or line-by-line implementation. When related functions need JSDoc, use parallel structure and wording so their shared behavior and meaningful differences are easy to compare. Don't go overboard with the comments - keep them short and to the point.
- Prefer testing modules through their public surface area. Do not add exports solely for tests. If testing a private implementation becomes difficult, first consider whether the behavior can be exercised through the public API, or the logic naturally belongs in a separate module with its own public contract. Avoid extracting code into artificial modules purely to enable direct testing — cohesion and API design take precedence over strict test isolation.
- Do not add tests for ui-component-only changes by default. For React/UI component styling, layout, composition, or small interaction tweaks, prefer focused verification with typecheck/lint and only add component tests when the user asks, the behavior is business-critical, or the change has nontrivial state/logic that is likely to regress.
- Keep the docs current. A change to what fleetfizz does is done when nothing in the website docs or the agent skill has gone stale.
  - **Website (`apps/website/content/docs`)**: rewrite every hand-written passage the change makes wrong, and add prose for new behavior a person would look for there. The reference under `apps/website/content/generated` is generated: when `apps/cli/src/reference.test.ts` fails on it, regenerate it with `pnpm --filter fleetfizz test -u`.
  - **Skill (`skills/fleetfizz/SKILL.md`)**: lean by design (ADR 0021). It holds only what `fizz <command> --help` and the config's `$schema` cannot tell an agent. Edit it only where the change contradicts a line already in it, and rewrite that line in place; new flags, fields, and commands reach agents through `--help`.
