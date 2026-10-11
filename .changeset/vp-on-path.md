---
"fleetfizz": patch
---

Every script puts vp on PATH itself. On Ubuntu, `.bashrc` returns before vp's env file in a non-interactive shell, so a Ship over Tailscale SSH never saw vp and bootstrapped it on every Ship.
