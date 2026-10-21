# One Linux Machine of the E2E Fleet: Node 24, git, a login shell, sshd, and
# gh, with a `fizz` user whose npm Globals go under its home. No pnpm and no
# skills CLI: the fixture Config installs them as Globals, as a user would.
FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git gpg openssh-server perl procps \
  && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends gh \
  && rm -rf /var/lib/apt/lists/*

# A usable (not locked) account that logs in only with a key.
RUN useradd -m -s /bin/bash fizz \
  && usermod -p '*' fizz \
  && mkdir -p /run/sshd \
  && printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\n' > /etc/ssh/sshd_config.d/e2e.conf

# npm Globals under the user's home, from the Fleet's Verdaccio, and on PATH
# in every login shell.
RUN printf 'prefix=/home/fizz/.npm-global\nregistry=http://verdaccio:4873/\n' > /home/fizz/.npmrc \
  && chown fizz:fizz /home/fizz/.npmrc \
  && printf 'export PATH="$HOME/.npm-global/bin:$PATH"\n' > /etc/profile.d/npm-global.sh

ENV SHELL=/bin/bash
COPY entrypoint.sh /usr/local/bin/entrypoint
ENTRYPOINT ["/usr/local/bin/entrypoint"]
