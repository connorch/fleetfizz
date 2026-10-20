# An agent skill in skills/fleetfizz, lean and deferring to --help

People ask their coding agent to "put tmux on the Linux boxes" or "find out why the Ship failed on the Studio". The agent can run `fizz`, but it does not know the workflow, and it has no terminal: every prompt fleetfizz shows a person is a default or a stop for an agent. So the repo carries a skill, installed with `npx skills add connorch/fleetfizz` and listed on skills.sh once people install it.

- **It lives at `skills/fleetfizz/SKILL.md`**, the skills CLI's documented location, and is named `fleetfizz`, the product, not `fizz`, its command.
- **It covers three jobs: change the config, ship, and debug a Ship.** Setting fleetfizz up is not one of them: `fizz init` needs a terminal, and it happens once per person.
- **It holds only what no lookup tells an agent**: the workflow, how Questions behave without a terminal, that removing an Item never uninstalls it, and how Targeting and Variants combine. Flags and fields come from `fizz <command> --help` and the config's `$schema`. An installed skill follows `main`, while every Machine runs the `version` its Config names (ADR 0019), so `--help` is right for the fizz at hand and a copy in the skill would not be.
- **A Ship starts with a dry run, and every Question goes to the user.** Without a terminal each Question takes its default (ADR 0006), so a Ship would skip it silently. The agent shows each one, then ships with one `--answer kind:subject=choice` per Question the user decided. The blanket forms (`kind=choice`, `--bump`, `--enforce`, `--overwrite-config`) are only for when the user asks for that behavior by name. A plan without Questions ships without asking: the request was the permission.
- **The agent edits the config with `fizz config add` and `remove` when they make the change** (ADR 0017), and by hand otherwise (an existing Item, Variants, skills, section settings), since `fizz config edit` needs an editor. `fizz config` then proves the config loads. A config that does not load never leaves this Machine: a Ship parses it before copying it.

## Considered Options

- **A workspace package (`packages/skill`) (rejected).** The skills CLI finds it only through its deep search, which runs only when no standard location (the repo root, `skills/`, `.claude/skills`, `.agents/skills`, and others) holds a skill. One project skill added there later would make `npx skills add connorch/fleetfizz` install that skill instead, without an error. A `.claude-plugin/plugin.json` naming the folder would fix it, at the cost of the repo presenting itself as a Claude Code plugin.
- **A generated `REFERENCE.md` with the config's shape, kept current like the website's docs (rejected).** It would be right for `main` and wrong for any other `version`, and `--help` and `$schema` are one lookup away.
- **Always confirm before a real Ship (rejected).** The only decisions in a Ship are its Questions, and those already go to the user.

## Consequences

- A change to how a command behaves without a terminal, or to the Question kinds, changes the skill too.
- `fizz init` does not offer the skill yet. Offering it needs a `skills` section, with `agents` and the skills CLI as a Global, which init does not write today.
