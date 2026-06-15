# HTML Review Docs

When creating a standalone HTML document for Brandon to review (reports, plans, prototypes, visual specs, audits, or other one-off artifacts), theme it with RiceKit by default.

Use the shared stylesheet at:

`/Users/brandon/.agents/assets/ricekit-doc.css`

Preferred usage for single-file artifacts:

```html
<style>
/* paste the contents of /Users/brandon/.agents/assets/ricekit-doc.css here */
</style>
```

For multi-page artifacts, either inline that stylesheet in every page or copy/link it next to the generated docs.

The stylesheet imports RiceKit's active CSS variables from both:

- `./rk-vars.css` when present next to the generated doc/CSS bundle
- `file:///Users/brandon/.config/ricekit/active/userstyles/rk-vars.css` as the default local-file fallback

So generated docs pick up the active RiceKit palette after a browser refresh when `ricekit apply` changes themes. If serving docs over `http://localhost`, symlink or copy `/Users/brandon/.config/ricekit/active/userstyles/rk-vars.css` into the doc directory as `rk-vars.css` because many browsers block `file://` imports from HTTP pages.

Scope: this applies only to agent-generated review artifacts. Do not override an existing production app, website, or design system unless explicitly asked.
