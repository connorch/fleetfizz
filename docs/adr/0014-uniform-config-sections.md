# Uniform config sections: one envelope, an items map, and Variants

Each section of the config had its own shape. `vp`, `brew`, and `cask` were objects with Targeting and `dependsOn`, but their Items sat under different keys (`globals`, `items`). `repos` was a bare array, so it could not take section Targeting or `dependsOn`, and its one setting, the Clone Root, lived outside it in `machines.<name>.clones`. Every Provider parsed its own section and copied Targeting by hand. A `files` Provider for Shared Files was coming next and would have added a fifth shape.

Every section now has the same envelope, and the engine owns it:

```jsonc
"repos": {
  "platforms": ["darwin"], "machines": [...], "dependsOn": [...],  // section Targeting and dependencies
  "cloneRoot": [{ "machines": ["connors-mac-studio"], "path": "/Volumes/..." }],  // Provider settings
  "items": {
    "t3code": { "origin": "connorch/t3code", "ref": "main", "install": "..." }
  }
}
```

- **`items` is a map keyed by Item name.** `vp.globals` becomes `vp.items`, and a repo's `name` becomes its key. A Global, Formula, or Cask keeps its one-line shorthand (`"vercel": "^59.25.4"`), and the key is the Item's address (`repos:t3code`). A duplicate key is a config error, which needs a parse-tree check because jsonc-parser keeps the last one silently.
- **An Item's value can be a list of Variants**: complete definitions, each with its own Targeting. A Machine gets the first Variant that targets it, and an Item with no Variant for a Machine is not targeted there. This is how one Item gets a different path on darwin and linux. The Provider receives the chosen definition and never sees Variants.
- **Per-Machine settings go through Targeting too.** `machines` becomes a list of names, and an empty one is a config error: the Fleet is only the Machines listed, never the whole tailnet. The Clone Root moves to `repos.cloneRoot`: a list of Targeted entries picked like Variants, a plain string for every Machine, or the default when nothing matches. No other setting takes Variants until one needs them.
- **The engine resolves Items for each Machine.** One schema helper builds every section, so no Provider can get the envelope wrong. A shorthand string decodes to its full entry when the config is read, so nothing after decoding sees two shapes, and a "bump" of a shorthand edits the string itself. The engine applies section and Item Targeting with AND and picks Variants; a Provider receives each chosen definition, without its Targeting, and where it sits in the config. vp's own settings (`version`, `node`, the package managers) stay section settings that create implicit Items, and a Global still cannot take one of their names.

## Considered Options

- **`items` as an array with a required `name` (rejected).** Variants would come free as repeated names, and duplicates are easy to catch, but every Global, Formula, and Cask loses its shorthand and becomes a two-field object. Those are most of the config.
- **A base definition plus merged overrides (rejected).** Less repetition, but it needs merge rules (does an override's `exclude` replace the base's or extend it?), and a Provider could see half-merged state.
- **Per-field Targeted values (rejected).** Any field could vary, so every field's schema doubles, and reading what a Machine gets means resolving each field separately.
- **Migrating old configs on load (rejected).** fleetfizz has one user, so an old config fails with an error that names what moved, and no second schema is carried.

## Consequences

- A config from before this change fails to load. It is rewritten by hand once.
- Repos take the short names their keys give them, so on the next Ship every Managed Clone path and Install Record changes. Each repo clones and installs again on every Machine, and the old clone directories stay behind until deleted by hand (removing an Item never uninstalls it).
- A new Provider declares its settings and its Item schema, and gets Targeting, Variants, shorthand, and `dependsOn` from the engine.
