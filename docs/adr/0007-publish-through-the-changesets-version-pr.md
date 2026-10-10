# Publish through the Changesets "Version Packages" pull request

Only `apps/cli` is published, as `fleetfizz`, with every workspace package bundled in by `vp pack`. Releases use Changesets v3 with `changesets/action` v2 (the two only work as a pair: action v1 with CLI v3 reports success but pushes no tags), in the flow Changesets recommends: each change lands on `main` with a changeset; the action keeps a "Version Packages" pull request up to date with the result of `changeset version`; merging that pull request publishes to npm, pushes the git tag, and creates the GitHub release. We chose this over running `changeset version` locally and pushing the bump, which Changesets documents only as a "finicky" fallback. This replaces the earlier decision to version locally.

## Consequences

- To publish, merge the Version Packages pull request (`gh pr merge`). Changesets accumulate there until then, so several changes can ship as one version.
- The repository setting "Allow GitHub Actions to create and approve pull requests" is on; the action needs it to open the pull request.
- Pull requests opened with the default `GITHUB_TOKEN` do not trigger other workflows, so the Version Packages pull request gets no CI run of its own. The release job runs the build before publishing, and every commit it versions already passed CI on `main`.
