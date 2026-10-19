# Shared Files: copied from the Starting Machine, kept by Install Records

Some files need to be the same on every Machine but belong to no repo: Karabiner's config, the wovn and claude-router configs (which hold secrets). The `files` Provider copies each one from the Starting Machine to every targeted Machine, the way a Ship already copies the Config (ADR 0008), with the contents kept out of argv, the Config, and every log.

```jsonc
"files": {
  "items": {
    "wovn": "~/.config/wovn",
    "karabiner": { "path": "~/.config/karabiner", "exclude": ["automatic_backups"] },
    "ghostty": [
      { "platforms": ["darwin"], "path": "~/Library/Application Support/com.mitchellh.ghostty" },
      { "platforms": ["linux"], "path": "~/.config/ghostty" }
    ]
  }
}
```

- **An Item is a named path**, a file or a directory. Its name, which names its record's file and its Steps, uses only letters, digits, `.`, `_` and `-`. Its path cannot be, hold, or sit inside `~/.config/fleetfizz` or `~/.local/state/fleetfizz`, which a Ship writes itself. A string is shorthand for `{ path }`, `~` is each Machine's own home, and a different path per Platform or Machine is a Variant (ADR 0014). The Starting Machine reads its own Variant's path and each target writes its own.
- **A directory is mirrored.** What the Starting Machine no longer has is deleted on the target too, one entry at a time, and a directory only once it is empty. `exclude` globs (relative to the path; one without a `/` matches a name at any depth) are neither copied, deleted, nor fingerprinted, so an excluded path inside a directory the Starting Machine removed stops that Item instead. Every Variant of one Item has the same `exclude`, so both sides leave the same paths alone. `.DS_Store` and `._*` are always excluded. A path the Starting Machine cannot read, or that is no file, directory or symlink (a socket, a FIFO), fails the Item; it is never taken as removed. On a target, such a path is never replaced without a Question. Mode bits are copied and count toward the fingerprint; a symlink is copied as a link, and the Ledger notes a link that dangles after it lands. A file where the Starting Machine has a directory (or the reverse) fails that Item.
- **The record rule (ADR 0010) decides.** Each Machine keeps an Install Record per Shared File: the entries (path, type, mode, hash or link target) of the last copy a Ship wrote there, and that Ship's time. Without a Question, a Ship writes a target that is missing the Item or still matches its record, unless that record is newer than the Starting Machine's own and holds a different copy. Otherwise it asks, overwrite, skip, or use that Machine's copy (a pull, below), skip by default:
  - the target has Drift (edited there): the Question names the changed paths, never their contents;
  - the target has a different copy no Ship wrote (the first Ship);
  - the target got a newer copy from a Ship that missed the Starting Machine, which a Ship from here would roll back. This is the Stale Config check (ADR 0008) for each file.
- **Not on the Starting Machine:** a Ship asks which other Machine's copy to pull, one choice per distinct copy (Machines that hold the same one are listed together), or skip, the default. Nothing is deleted. An Item that has no Variant for the Starting Machine is skipped, with "ship from a Machine it targets"; relaying it between targets would make a second source of truth.
- **A pull** runs once every Question is answered, before anything else changes, and the Ship then starts over from the Check, as when a Stale Config is adopted. The Starting Machine sends a one-time key on stdin; the other Machine encrypts each file with `openssl enc -aes-256-cbc -pbkdf2` (the key in its environment, never argv) and prints the ciphertext, and the Starting Machine decrypts it with its own `openssl` as it writes, with that Machine's record, so the next Ship sees one copy on both. A remote's contents leave it only this way: what it prints is what session recording captures, so it is never plaintext. A Machine without `openssl` is not offered as a source, nor is any when the Starting Machine lacks it, and the skip says which needs it; push needs no `openssl` anywhere. A copy over the size limit is never offered.
- **Contents travel only on stdin.** The Starting Machine reads them during the Ship and sends them, base64, on the Apply's stdin after the Config, only to Machines that change. The plan holds them in a value that every log prints as `[hidden]`. The target writes each file to a temporary file beside it, created owner-only before any byte lands, then sets its mode and renames it into place. The Ledger shows a short fingerprint (`files:wovn a1b2c3d → 9f8e7d6`). An Item over 10 MB after excludes fails rather than stream.
- **`files` runs first** and depends on nothing, so an Install Command can read a Shared File copied in the same Ship.

## Considered Options

- **A private dotfiles repo as a Tracked Repo (rejected).** It puts the secrets on GitHub, and a Managed Clone is reset to origin on every Ship: a symlinked `karabiner.json` loses each edit Karabiner writes, and a copy never sends one back.
- **Contents inline in the Config (rejected).** Secrets in a file that may be under git, and 18KB of Karabiner JSON in the Config.
- **Overlay instead of mirror (rejected).** A file only the target has keeps its fingerprint different forever, so every Ship asks the same Question. With mirror it is Drift, and the Question protects it before anything is deleted.
- **Stamps per file, like the Config's `shippedTo` (rejected).** The record already holds the time; the stamps exist for the Config only because it has no record.
- **Following symlinks (rejected).** A link to a file outside the path would copy that file under the link's name and break the link everywhere.

## Consequences

- This is the only Provider that deletes anything, and only inside a path the Config lists, behind the same Questions as an overwrite.
- A Machine that writes nothing still gets an Install Record for each Shared File it already matches, so the next Ship can tell an edit there from a copy it was sent.
- A Ship with `--only` that leaves out the Starting Machine does not update the Starting Machine's own record, so the next Ship from there may ask whether the targets' newer copy should be kept.
- A pulled copy's lines never reach the Ship Log: the pull reads its own output rather than going through the Check, which logs every line.
