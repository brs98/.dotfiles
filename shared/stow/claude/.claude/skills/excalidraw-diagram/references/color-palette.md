# Color Palette & Brand Style — Catppuccin Mocha

**This is the single source of truth for all colors and brand-specific styles.** Based on [Catppuccin Mocha](https://github.com/catppuccin/catppuccin).

---

## Catppuccin Mocha Reference

| Name | Hex |
|------|-----|
| Rosewater | `#f5e0dc` |
| Flamingo | `#f2cdcd` |
| Pink | `#f5c2e7` |
| Mauve | `#cba6f7` |
| Red | `#f38ba8` |
| Maroon | `#eba0ac` |
| Peach | `#fab387` |
| Yellow | `#f9e2af` |
| Green | `#a6e3a1` |
| Teal | `#94e2d5` |
| Sky | `#89dceb` |
| Sapphire | `#74c7ec` |
| Blue | `#89b4fa` |
| Lavender | `#b4befe` |
| Text | `#cdd6f4` |
| Subtext1 | `#bac2de` |
| Subtext0 | `#a6adc8` |
| Overlay2 | `#9399b2` |
| Overlay1 | `#7f849c` |
| Overlay0 | `#6c7086` |
| Surface2 | `#585b70` |
| Surface1 | `#45475a` |
| Surface0 | `#313244` |
| Base | `#1e1e2e` |
| Mantle | `#181825` |
| Crust | `#11111b` |

---

## Shape Colors (Semantic)

Colors encode meaning, not decoration. Each semantic purpose has a fill/stroke pair.

| Semantic Purpose | Fill | Stroke |
|------------------|------|--------|
| Primary/Neutral | `#89b4fa` (Blue) | `#45475a` (Surface1) |
| Secondary | `#74c7ec` (Sapphire) | `#45475a` (Surface1) |
| Tertiary | `#b4befe` (Lavender) | `#45475a` (Surface1) |
| Start/Trigger | `#fab387` (Peach) | `#45475a` (Surface1) |
| End/Success | `#a6e3a1` (Green) | `#45475a` (Surface1) |
| Warning/Reset | `#f38ba8` (Red) | `#45475a` (Surface1) |
| Decision | `#f9e2af` (Yellow) | `#45475a` (Surface1) |
| AI/LLM | `#cba6f7` (Mauve) | `#45475a` (Surface1) |
| Inactive/Disabled | `#6c7086` (Overlay0) | `#45475a` (Surface1, dashed) |
| Error | `#f38ba8` (Red) | `#45475a` (Surface1) |

**Rule**: Use Surface1 (`#45475a`) as the universal stroke. Fills are the accent colors.

---

## Text Colors (Hierarchy)

Use color on free-floating text to create visual hierarchy without containers.

| Level | Color | Use For |
|-------|-------|---------|
| Title | `#89b4fa` (Blue) | Section headings, major labels |
| Subtitle | `#74c7ec` (Sapphire) | Subheadings, secondary labels |
| Body/Detail | `#a6adc8` (Subtext0) | Descriptions, annotations, metadata |
| On dark fills | `#1e1e2e` (Base) | Text inside light-colored shapes |
| On light fills / canvas | `#cdd6f4` (Text) | Text on dark backgrounds |

---

## Evidence Artifact Colors

Used for code snippets, data examples, and other concrete evidence inside technical diagrams.

| Artifact | Background | Text Color |
|----------|-----------|------------|
| Code snippet | `#181825` (Mantle) | `#cdd6f4` (Text) or syntax-colored |
| JSON/data example | `#181825` (Mantle) | `#a6e3a1` (Green) |

---

## Default Stroke & Line Colors

| Element | Color |
|---------|-------|
| Arrows | `#89b4fa` (Blue) or match source element's fill |
| Structural lines (dividers, trees, timelines) | `#6c7086` (Overlay0) |
| Marker dots (fill + stroke) | `#89b4fa` (Blue) |
| Danger / boundary lines | `#f38ba8` (Red) |

---

## Background

| Property | Value |
|----------|-------|
| Canvas background | `#1e1e2e` (Base) |
