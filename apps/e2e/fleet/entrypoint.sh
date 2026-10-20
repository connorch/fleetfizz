#!/bin/sh
# Installs this run's ssh key for `fizz`, so every Machine can reach every
# other, then runs sshd.
set -eu
: "${E2E_PUBLIC_KEY:?}" "${E2E_PRIVATE_KEY:?}"
install -d -m 700 -o fizz -g fizz /home/fizz/.ssh
printf '%s\n' "$E2E_PUBLIC_KEY" > /home/fizz/.ssh/authorized_keys
printf '%s\n' "$E2E_PRIVATE_KEY" > /home/fizz/.ssh/id_ed25519
chown fizz:fizz /home/fizz/.ssh/authorized_keys /home/fizz/.ssh/id_ed25519
chmod 600 /home/fizz/.ssh/authorized_keys /home/fizz/.ssh/id_ed25519
exec /usr/sbin/sshd -D -e
