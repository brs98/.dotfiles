# code-move-map data format

One JSON object. `render.py` validates it, fills defaults (colors, footnote), and injects it
into `templates/code-move-map.html`. A complete working example is `examples/example.json`.

Text fields marked *md* accept a tiny markup: `` `code` ``, `**bold**`, and `\n` for a line
break. Everything else is escaped. Raw HTML is not allowed.

## Top level

| Key | Req | Meaning |
| --- | --- | --- |
| `title` | yes | Page `<title>` and `<h1>` (*md*). |
| `intro` | | Lede under the title: a string or a list of paragraphs (*md*). Say what each color means. |
| `before`, `after` | | `{label, ref, sha}`. `label` is the column heading ("Before · on main"). `sha` or `ref` is what `--repo` reads files at. |
| `gutter` | | Small text between the columns (*md*), e.g. `"moved by\nPR 3 and PR 4"`. |
| `categories` | yes | See below. |
| `files` | yes | See below. Before-side and after-side files, in display order. |
| `moves` | yes | See below. It may be `[]`. |
| `table` | | `{title, columns[5], rows[]}`. If `rows` is missing, the table is generated with one row per move. |
| `diagram` | | `{title, intro, source}`. `source` is Mermaid text, loaded from jsDelivr only when present. |
| `footnote` | | *md*. If it is missing, it is built from `before`/`after` ref and sha. |
| `scale`, `minHeight` | | Block height in px per line (default `0.55`) and the minimum height (default `22`). Raise `scale` for small files. |

## categories[]

`{id, kind, label, filter?, short?, color?}`

- `id`: `[A-Za-z][A-Za-z0-9_-]*`.
- `kind`:
  - `move`: solid colored arrows and tinted blocks. Use one per commit or PR.
  - `stay`: grey dashed arrows, for code that stayed in place.
  - `new`: dashed orange outline, for code with no source. It cannot be a move's category.
  - `removed`: dashed red outline with the label struck through. Before side only, and it has no arrows.
- `label`: legend text. `filter`: the filter button text (default "<label> only").
  `short`: the tag text in the table (default `label`).
- `color`: `#rrggbb`. Defaults: `move` categories cycle teal, purple, blue, rose, green,
  ochre, cyan; `stay` is grey, `new` is orange, `removed` is red.

## files[]

`{side, path, display?, lines?, note?, rev?, blocks[]}`

- `side`: `before` or `after`. The same path may appear on both sides.
- `path`: the real repo-relative path, which `--repo` uses. `display`: the shorter name shown on the page.
- `lines`: the total line count (shown as "1,556 lines"). `--repo` checks it against git.
- `note`: extra header text, joined with " · " (`"new"`, `"+5 lines"`).
- `rev`: a per-file ref override for `--repo`, which is rarely needed.

### blocks[]

`{id, label, start, end, category, anchor?}`

- `id`: unique across **all** files (for example `b1…` before, `a1…` after).
- `label` (*md*): plain language.
- `start`, `end`: 1-based and inclusive. Use `start == end` for a single line.
- `category`: the color. Before-blocks take the category of the commit that moved them;
  after-blocks take the category of the commit that brought them in.
- `anchor`: a substring expected on line `start`. `--repo` fails if it is missing.

## moves[]

`{from, to, category, changed?}`

- `from`: a before-block id. `to`: an after-block id, or a list of them for a split.
  Several moves may share a `from` (a split) or a `to` (a merge).
- `category`: a `move` or `stay` category.
- `changed` (*md*): used only by the generated table.

## Checks render.py runs

Errors (not rendered): missing or invalid fields, unknown ids or categories, duplicate ids or
moves, `start > end`, `end > lines`, a `from` that is not on the before side or a `to` that is
not on the after side, and a move with a `new`/`removed` category. With `--repo`, also a file
missing at its ref, a `lines` mismatch, a block running past the end of the file, and an anchor
that is not on its start line.

Warnings: overlapping or out-of-order blocks, a before-block with no move that is not
`removed`, and an after-block with no source that is not `new`. `--strict` makes warnings
fatal.
