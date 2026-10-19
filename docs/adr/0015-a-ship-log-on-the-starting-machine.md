# A Ship Log on the Starting Machine, read from any Machine

Amends ADR 0009.

When a Ship went wrong there was little to go on. The Ledger shows outcomes, and keeps a Step's output only when it fails; the output of Steps that succeeded, the generated scripts, the Check's output, and the stack trace behind a one-line error were all thrown away, and nothing said what the Ship decided or why.

Every Ship, dry runs included, now writes a Ship Log on the Starting Machine as it runs: `~/.local/state/fleetfizz/logs/<ship-id>.log`. The Ship id is when the Ship started (UTC, to the second) and the Starting Machine, `2026-10-18T14-03-22Z-connors-macbook-pro`, and the Ship prints it last (`log: fizz logs <ship-id>`), however it ends. The log holds the flags, the tailnet, the targets, every Machine's Check and Apply script and every line it printed, protocol markers included, each script's exit code and time, every Ledger event (plans, Steps, notes, Questions and answers), and the full Cause of an error or interruption. Each line reads `<time> <LEVEL> [<machine> <phase>] <text>`; lines a Machine printed start with `> `. The Lent Token is replaced with `[hidden]` anywhere it appears. A Machine keeps its last 20 Ship Logs.

It is written through Effect's logger, which during a Ship writes only to the file, so the live Ledger is never disturbed.

`fizz logs` prints one. Without a Ship id it shows the latest Ship that started on or reached this Machine: the newest log here, unless this Machine's config stamp (ADR 0008) says a Ship from another Machine reached it later, in which case it reads that Ship's log from its Starting Machine over `tailscale ssh`. `fizz logs <ship-id>` reads that Ship's log from the Machine its id names, `--machine` keeps one Machine's lines, and `--list` lists the Ships started here.

## Considered Options

- **A log on every target Machine too (rejected).** Every line a target prints already reaches the Starting Machine over ssh, and a dropped session ends the remote script, `tee` included, so a remote copy would hold nothing more. It would change the generated scripts and need pruning on every Machine.
- **Only on the target Machines, gathered by `fizz logs` (rejected).** It stores nothing twice, but the Ship's own decisions and errors live on the Starting Machine anyway, and gathering one Ship would need an ssh to every Machine it touched.
- **Copying each Ship Log to every Machine it reached (rejected).** It would keep logs readable while the Starting Machine is offline, at the cost of another round of ssh after every Ship.
- **A `--verbose` flag that streams the log (rejected).** Streamed lines fight the live Ledger, and the log is always written, so `tail -f` on it does the same.
- **JSON lines (rejected).** The log is for a person reading it and for grep; one text line per line of output serves both.

## Consequences

- ADR 0009's "a Ship started on another Machine is not visible here" holds for `fizz report`, not for `fizz logs`.
- A Ship Log is readable only while its Starting Machine is online. `fizz logs` reads the tailnet only to reach another Machine, so this Machine's own logs stay readable when Tailscale is down.
- The tailnet is read before the log opens, since the Starting Machine names it; a failure reading it prints as before and leaves no log.
