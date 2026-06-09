# lib/

Shared code for the Pi extensions in this package. Modules here are imported by the
top-level extension entry points (and directory extensions) via `./lib/<module>.js`.

Invariant: never add an `index.ts` to this directory — Pi auto-loads any top-level
directory containing an `index.ts` as an extension, and lib/ must not be loaded as one.
