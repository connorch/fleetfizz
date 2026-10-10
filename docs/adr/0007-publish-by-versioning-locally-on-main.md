# Publish by versioning locally on main

Only `apps/cli` is published, as `fleetfizz`, with every workspace package bundled in by `vp pack`. Releases use Changesets v3 with `changesets/action` v2 (the two only work as a pair: action v1 with CLI v3 reports success but pushes no tags). To publish, add a changeset, run `pnpm changeset version` locally, commit `chore(release): fleetfizz@x.y.z`, and push to main. The release workflow then finds no pending changesets and publishes. We chose this over merging the action's "Version Packages" pull request because Connor's rule is that pushing to main with the right changeset is how you publish, with no pull request to merge.

## Consequences

- Pushing a changeset without running `changeset version` makes the action open a Version Packages pull request instead, which batches changesets until it is merged. That is allowed but not the normal flow.
- `@changesets/changelog-github` looks up commits on GitHub during `changeset version`, so running it locally needs `GITHUB_TOKEN` set (for example from `gh auth token`).
- The local flow does not need the repo setting that lets GitHub Actions open pull requests.
