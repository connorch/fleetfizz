---
"fleetfizz": minor
---

vp and Tracked Repos are now Providers in one engine, and every Item is written `provider:item` (`vp:node`, `repos:connorch-t3code`) in the Ledger, `fizz report`, and flags.

- Breaking: `--rebuild` takes an address, `--rebuild repos:<name>`, or `all`.
- `--answer kind=choice` answers Questions in advance (`range=bump|skip|downgrade`, `config=overwrite|stop`), or one of them with `kind:subject=choice` (`range:vp:vercel=bump`). `--bump`, `--enforce`, and `--overwrite-config` still work as shorthands.
- A Global can have its own Targeting: `{ "range": "^4", "machines": ["connors-mac-studio"] }`.
- A repo's branch is resolved to one commit on the Starting Machine, so every Machine installs the same commit in one Ship, and a dry run shows the new commit.
- When vp, Node, or a Global fails on a Machine, that Machine's repo changes are skipped ("depends on vp").
- Install Records move to `records/<provider>/<item>.json`; the old files are still read, and the next install moves them.
