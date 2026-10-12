# A live Ledger grouped by Machine, drawn with Ink

The Ledger was one append-only line per event (`elapsed  machine  TAG  message`). Apply runs every Machine in parallel, so on a three-Machine Fleet the RUN and OK lines of different Machines mixed together, every PLAN line joined all of a Machine's Steps with `·`, and the run ended with one count. Nobody could see at a glance what changed on each Machine and how each one ended.

The Ledger is now one line per Machine in config order, with a blank line between Machines. Under each Machine there is one line per item that changes: vp, Node, a Global, or a Tracked Repo. Each item line starts with its status (`✓ done`, `▸ installing`, `· queued`, `✗ failed`, `– skipped`), then shows `from → to` (`+ to` when new), its time, and why. All lines share one set of columns. The Machine line has no status of its own: it ends with a summary of its items in their colors (`1 of 4 done`, then `4 of 4 done` in green, `1 failed, 1 skipped` in red and yellow, `up to date` in green), or, when the Machine was skipped or failed as a whole, that status and the reason:

```
connors-mac-studio                                up to date

connors-macbook-pro                       5m 07s  2 of 2 done
✓ done          vp               1.0.0 → 1.1.0     16.6s
✓ installed     connorch-t3code  3f1a2b0 → 9e02bb1  4m 50s

homelab                                           – skipped  offline

ok 2  skipped 1  failed 0  in 5m 12s
full report: fizz report
```

In a terminal, Ink draws this list live and redraws it in place as Steps start and end, always shorter than the window: when it does not fit, Machines that are not running or failing show only their own line, and past that the list is cut. `f` switches to the full list, which adds every unchanged item and the config copy. When the Ship ends, the live list is erased and the result prints once as ordinary output, with every FAIL output block, and the process exits. Questions and their answers, and other Fleet-level lines, print once above the list as they happen. The Questions themselves are asked inside the live view as a list of choices, so Ink is the only thing that reads keys. When stdout is not a terminal, nothing is redrawn: the notes print as they happen, and the full list prints once at the end, without color. Every real Ship saves its full Ledger on the Starting Machine (`~/.local/state/fleetfizz/last-ship.json`), and `fizz report` prints it with every FAIL output block.

A Tracked Repo's new commit is known only after Apply fetches it, so the Apply script now prints a `repo` Fact with the fetched commit.

## Considered Options

- **Append-only, grouped by phase (rejected).** PLAN, ASK, APPLY, and DONE headers, with the Apply lines still from all Machines. It labels the phases, but the Apply lines still mix and every Step is printed several times.
- **Append-only, one block per Machine when it ends (rejected).** No mixing, but there is no output while a long install runs, and the blocks print in finish order.
- **Per-line phase prefixes (rejected).** They add a column to every line and do nothing to stop the mixing.
- **A status for the Machine line too (OK, RUN, FAIL, SKIP) (replaced).** It sat after the name, while the items' status was elsewhere, and the columns did not line up. The summary says the same, from the items. Statuses were in capitals for outcomes and lowercase for progress; now they are all lowercase.
- **A fleet matrix, one column per Machine (rejected).** It shows drift across the Fleet well, but it is too wide past about four Machines.
- **Finished Machines into scrollback, a live region for running ones (rejected).** It never grows taller than the terminal, but Machines end up in finish order and `f` could expand only the running ones. The list stays live until the Ship ends instead, kept shorter than the window: Ink cannot redraw a frame taller than the terminal in place (it clears the screen, scrollback included, on every update).
- **The alternate screen (rejected).** The result would disappear when the Ship exits.
- **Lines of styled text from a pure function, with our own ANSI codes for printing (replaced).** The first version: Ink only painted them. It was a second rendering system next to Ink's; Ink's `renderToString` draws the same component for a pipe, the report, and tests.
- **The last live frame left in scrollback (replaced).** A frame taller than the window lost its trailing newline, so the shell prompt landed on the summary line.
- **A hand-rolled renderer on `effect/Terminal` (rejected).** About 150 lines and no new dependencies, but Ink already handles the hard parts: raw mode, resize, frame diffing, and console output above the frame.
- **Effect `Prompt` for Questions, with Ink paused (rejected).** Effect's Terminal turns raw mode off about 10 ms after a Prompt ends, which breaks the live view that has just been mounted again. Asking inside Ink means one owner of the terminal.
- **`fizz ship --report` (rejected).** A read-only flag on a command that changes things: forgetting the flag runs a Ship.
- **Wait for a key at the end (rejected).** It holds the shell. `fizz report` gives the full list without that.

## Consequences

- Amends ADR 0005: Ink and React are runtime dependencies, bundled into the one CLI file, and Questions are asked in Ink, not with `effect/cli`'s `Prompt`. Effect is still used everywhere else.
- `ledger.ts` holds the state (a Schema) and its events. `view.tsx` is one Ink component that draws it: `render` live, `renderToString` for a pipe, the end of a Ship, `fizz report`, and the tests, which check its exact text.
- A saved log from a pipe has every item, with no expansion needed.
- `fizz report` shows only the last Ship from this Machine. A Ship started on another Machine is not visible here.
