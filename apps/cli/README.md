![fleetfizz: Your machines, in sync.](https://fleetfizz.com/readme-banner.png)

Your machines, in sync. One command, and every machine on your tailnet has the same tools, versions, and repos.

fleetfizz keeps every Machine on a Tailscale tailnet in line with one config: vite-plus Globals, Homebrew Formulae and Casks, agent skills, Shared Files like dotfiles, and a clone of each tracked git repo. `fizz ship` runs on the Machine you start it from and drives the others over `tailscale ssh`.

## Install

```sh
vp install -g fleetfizz
```

## Use

```sh
fizz init   # check this Machine and write a first config
fizz ship   # bring every Machine in line with the config
```

`fleetfizz` is an alias of `fizz`.

## Docs

- [Overview](https://fleetfizz.com/docs)
- [Getting started](https://fleetfizz.com/docs/getting-started): Tailscale SSH, `fizz init`, and a first Ship
- [Config](https://fleetfizz.com/docs/config): every section and setting
- [Commands](https://fleetfizz.com/docs/commands): every command and flag

Source and issues: [github.com/connorch/fleetfizz](https://github.com/connorch/fleetfizz)
