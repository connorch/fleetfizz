---
"fleetfizz": minor
---

New `fizz init`: checks that this Machine can ship (vp, Tailscale connected with Tailscale SSH, and Homebrew and `gh` when needed) and prints the fix for each problem, then asks which Machines on the tailnet are in the Fleet, whether to pin vp and Node, and which Globals, Formulae, Casks, and common dotfiles to keep in line, and writes the config and `schema.json`. Getting started and its setup prompt now use it. A missing config now says to run `fizz init`.
