# Questions of every kind, answered in advance with --answer

Amends ADR 0006 and ADR 0008.

A Question was two bespoke things: a Global above its Range (ADR 0006) and a Stale Config (ADR 0008), each with its own flags (`--bump`, `--enforce`, `--overwrite-config`). With Providers (ADR 0010) any Item can need one, so a Question is now one shape: a kind, a subject (an address, or a Machine for a Stale Config), what was found, the problem, its choices, and a default for when nobody can be asked.

| kind     | subject   | choices                     | default |
| -------- | --------- | --------------------------- | ------- |
| `range`  | an Item   | `bump`, `skip`, `downgrade` | `skip`  |
| `config` | a Machine | `overwrite`, `stop`         | `stop`  |

A Provider returns `ask` with its Question; the engine groups the same kind and subject across Machines and asks it once in the live Ledger, after every Machine is checked and before any changes. The answer goes back to the Provider's decide, which turns it into a change or a skip. A `bump` edits the config at the key path the Question carries, to a Range that includes the newest version found, then the Ship plans again from the new config.

`--answer kind=choice` answers every Question of a kind in advance, and `--answer kind:subject=choice` answers one (`--answer range:vp:vercel=bump`); the more specific answer wins. It is repeatable and checked before anything runs. The old flags stay as shorthands: `--bump` is `range=bump`, `--enforce` is `range=downgrade`, and `--overwrite-config` is `config=overwrite`.

Without a terminal, each Question takes its default, as ADR 0006 already did for `range`; a Stale Config still stops the Ship, as in ADR 0008. In a terminal, the Stale Config Question keeps its third choice, `use the config on <machine>`, which only makes sense live.

## Considered Options

- **A flag per choice (rejected).** Every new Question kind would add flags, and they could not name one subject.
- **Remembering answers (rejected).** A skipped Item is asked again on the next Ship, as ADR 0006 decided.

## Consequences

- A dry run lists every Question with what was found and does not ask it.
- A new Question kind needs only a key in `QUESTION_CHOICES` and a default.
