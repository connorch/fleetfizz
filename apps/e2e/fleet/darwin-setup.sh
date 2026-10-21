#!/bin/sh
# Makes this Mac a darwin Fleet of two Machines: the user who runs the suite
# is the Starting Machine, and a second user, m2, is the Machine `mac-b`,
# reached over ssh to localhost. m2 reaches the Starting Machine back the same
# way. Run with sudo, only on a throwaway Mac (a CI runner, a Tart VM): it adds
# a user, turns on Remote Login, and edits both users' ~/.zprofile, ~/.npmrc,
# and ~/.ssh.
#
#   E2E_PUBLIC_KEY        the key both users let in
#   E2E_PRIVATE_KEY_PATH  its private half, which m2 signs in with
#   E2E_REGISTRY    the Fleet's Verdaccio, every Machine's npm registry
#   E2E_NODE_DIR    a Node 24 install (its bin/node), copied where m2 can run it
set -eu
: "${SUDO_USER:?run with sudo}" "${E2E_PUBLIC_KEY:?}" "${E2E_PRIVATE_KEY_PATH:?}"
: "${E2E_REGISTRY:?}" "${E2E_NODE_DIR:?}"
remote=m2
node_dir=/usr/local/fleetfizz-e2e/node

rm -rf "$node_dir"
mkdir -p "$(dirname "$node_dir")"
cp -RH "$E2E_NODE_DIR" "$node_dir"

if ! id "$remote" >/dev/null 2>&1; then
  sysadminctl -addUser "$remote" -shell /bin/zsh -password "$(openssl rand -hex 16)" 2>&1
  createhomedir -c -u "$remote" >/dev/null
fi

# Remote Login, for the users the suite signs in as.
launchctl enable system/com.openssh.sshd
launchctl bootstrap system /System/Library/LaunchDaemons/ssh.plist 2>/dev/null || true
if dscl . -read /Groups/com.apple.access_ssh >/dev/null 2>&1; then
  for user in "$SUDO_USER" "$remote"; do dseditgroup -o edit -a "$user" -t user com.apple.access_ssh; done
fi

# Both users: Node 24 and their npm Globals on PATH in a login shell, and npm
# Globals under their home, from the Fleet's Verdaccio.
for user in "$SUDO_USER" "$remote"; do
  home=$(dscl . -read "/Users/$user" NFSHomeDirectory | awk '{ print $2 }')
  printf '\nexport PATH="%s/bin:$HOME/.npm-global/bin:$PATH"\n' "$node_dir" >> "$home/.zprofile"
  printf 'prefix=%s/.npm-global\nregistry=%s\n' "$home" "$E2E_REGISTRY" > "$home/.npmrc"
  chown "$user" "$home/.zprofile" "$home/.npmrc"
done

home=$(dscl . -read "/Users/$remote" NFSHomeDirectory | awk '{ print $2 }')
install -d -m 700 -o "$remote" "$home/.ssh"
printf '%s\n' "$E2E_PUBLIC_KEY" > "$home/.ssh/authorized_keys"
chown "$remote" "$home/.ssh/authorized_keys"
chmod 600 "$home/.ssh/authorized_keys"
install -m 600 -o "$remote" "$E2E_PRIVATE_KEY_PATH" "$home/.ssh/id_ed25519"

# The Starting Machine's user lets the same key in, for `fizz logs` on m2.
home=$(dscl . -read "/Users/$SUDO_USER" NFSHomeDirectory | awk '{ print $2 }')
install -d -m 700 -o "$SUDO_USER" "$home/.ssh"
grep -qxF "$E2E_PUBLIC_KEY" "$home/.ssh/authorized_keys" 2>/dev/null ||
  printf '%s\n' "$E2E_PUBLIC_KEY" >> "$home/.ssh/authorized_keys"
chown "$SUDO_USER" "$home/.ssh/authorized_keys"
chmod 600 "$home/.ssh/authorized_keys"
