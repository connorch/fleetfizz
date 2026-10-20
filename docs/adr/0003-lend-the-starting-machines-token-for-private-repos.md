# Lend the Starting Machine's GitHub token for private repos

Over Tailscale SSH a remote Mac cannot read its login keychain, so its `gh` token is unusable and an HTTPS fetch of a private repo fails. Instead, the Starting Machine (where the user is logged in) runs `gh auth token` and lends that token to each remote Machine for one Ship. It travels on the ssh session's stdin, lives only in a shell variable, and reaches only `git clone` and `git fetch` through a one-shot credential helper. It is lent whenever `gh auth token` succeeds, without checking which repos are private. It is never exported, so Install Commands (which run each repo's own code) never see it, and nothing is written to disk.

The skills CLI gets it too (ADR 0018), so private skill sources install: one `skills add` process at a time, as `GH_TOKEN` for GitHub's API and through the same credential helper for the git it runs, set in that process's environment only. The Starting Machine also uses it to read skill hashes from GitHub. It is read whenever a repo or a skill is targeted.

## Considered Options

- **A plaintext gh token on each Machine (`--insecure-storage`) (rejected).** Puts a token on disk everywhere.
- **Fine-grained GitHub PATs (rejected).** Painful onboarding in the GitHub dashboard.
- **Pipe git bundles from the Starting Machine (rejected).** The Starting Machine must keep a copy of every private repo and build incremental bundles.
- **Store the token in a signing keychain, or unlock the login keychain over ssh (rejected).** Unproven over ssh, needs setup at each keyboard, or sends the login password between Machines.

## Consequences

- A Ship can fetch private repos and skills only when it starts from a Machine whose `gh` is logged in. If `gh auth token` fails, private ones fail and public ones still ship.
- The skills CLI is third-party code that sees the token while it installs. It is a pinned vp Global the user chose, unlike an Install Command, which is any repo's own code.
- The token carries the user's full gh scopes. It exists only in memory on the user's own Machines, inside an encrypted Tailscale session.
