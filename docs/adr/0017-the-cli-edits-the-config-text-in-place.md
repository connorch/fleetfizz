# The CLI edits the config's text in place, and never writes an invalid config

`fizz config add`, `remove`, and `edit` change the config for the person, so they need two guarantees: the file still reads as they wrote it, and it still loads. The config is the one file every Ship reads and copies to every Machine (ADR 0008), so a broken one stops every Ship from every Machine until someone fixes it by hand.

- **Edits change only the text they must.** An insert adds one member after the last one, in the layout its siblings use: its own line in an object written over several lines, `, member` in one written on one line, with a trailing comma when its siblings have one. A value goes on one line when it fits in 100 columns, as the docs write it (`"tmux": { "range": "*", "platforms": ["linux"] }`), else one entry per line. When the first line an insert changes is longer than that afterwards, whether the insert made it long or it already was, the outermost object or list written on that line is first spread one member per line, again until the line fits or nothing on it can be spread, unless that would drop a comment. A removal takes the member's comma, and its line with any comment after it when it is alone there. A missing section is created inside the deepest object that exists. Comments and everything else stay as they are.
- **An edit checks its own result.** The new text must parse to exactly the old config with the one change, and an insert must keep every comment. A layout the edits do not handle is refused with a pointer to `fizz config edit`, never saved wrong.
- **Every edit is validated before it is written.** `saveConfig` parses the new text exactly as a Ship would (`parseConfig`) and writes it only when it loads, atomically through a temporary file. `fizz config edit` gives the editor a copy, and replaces the config only with a copy that loads, so the config is never invalid, not even while it is open. When the config changed while the editor was open, it is left alone and the edit is printed instead.
- **An Item is written as the docs write it**: the shorthand (`"gh": "*"`, `"vaut": "~/.config/vaut"`) when it has no Targeting, the object when it does.
- **`add` never changes an Item that exists, and `remove` never uninstalls.** Changing an Item, or adding a Variant to it, is `fizz config edit`: where a Variant goes decides which Machines get it, which a flag would have to guess. Removing an Item only stops a Ship from managing it, as always.

## Considered Options

- **jsonc-parser's `modify` for every edit (rejected).** It is right for replacing one value, which is all a bump does, and bump.ts still uses it. For an insert it puts the new member before the previous one's line comment, which then reads as the new member's; for a removal from an object with trailing commas it leaves a stray comma, which does not parse; and it writes every object and list over several lines.
- **Decode, change, and re-serialize the config (rejected).** Every comment and the person's layout would be lost on the first `add`.

## Consequences

- `removeAt` and `insertAt` in `@fleetfizz/config` are the only writers of new structure; `bumpText` replaces values.
- `fizz config remove machines:<name>` also takes the name out of every Targeting list, and changes nothing when a list would be left empty, since an empty list is invalid and dropping the Item would remove what the person did not name.
