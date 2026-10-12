# Agentless Ship over Tailscale SSH

fleetfizz runs only on the Starting Machine. It drives every other Machine with generated POSIX shell scripts over `tailscale ssh`, the way Ansible does, so a remote Machine needs only `tailscaled` with SSH enabled, `git`, `vp`, and a shell. We chose this over the design it replaces (connorch/skills `apps/ship`), which ran a copy of the tool on each remote Machine: that needs a remote install, version-skew handling, and a bootstrap step, and Questions need state from every Machine before anything changes anyway.

A Ship has four phases: Check (one ssh per Machine, read-only; called Gather until 0.5.1), Plan (pure, local), Prompt (local TTY), and Apply (one ssh per Machine). Every Machine is checked before any Question is asked, and no Machine changes before every Question is answered. The Starting Machine is a target of its own Ship and runs the same scripts locally without ssh.

## Considered Options

- **A copy of the tool on each Machine (rejected).** See above.
- **LaunchAgent pull (rejected in connorch/skills ADR 0001).** Needs a daemon, scheduling, and a report channel on every Machine.
- **Plain `sshd` (Remote Login) on the Macs (rejected in connorch/skills ADR 0001).** macOS listens on every interface, so a laptop on public wifi exposes port 22.

## Consequences

- Tailscale SSH on macOS reports exit code 0 even when the remote command fails, and 255 when it cannot connect. A Step succeeds only when its `ff-done` marker says so; exit 255 means the Machine is skipped. fleetfizz generates both ends of this marker protocol.
- The script travels in argv and carries no secrets. Secrets travel on the session's stdin, one per line, in a fixed order, because argv is visible in `ps`.
- Scripts run in the remote login shell (zsh on macOS, bash on linux), so they must work in both.
- Every Mac runs the open-source `tailscaled` with `--ssh`, not Tailscale.app, and the tailnet's ssh rule uses `accept`, not `check`, so a scripted Ship never stalls on a browser prompt.
- There is no TTY on the remote and its keychain is locked: anything that prompts there fails.
