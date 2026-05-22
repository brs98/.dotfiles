---
name: imagegen
description: Generate bitmap images through Pi's generate_image tool backed by Codex CLI's hosted image generation. Use when the user asks to create, generate, draw, render, or make a bitmap image file.
---

# Image Generation

Use the `generate_image` tool when the user wants a generated bitmap image saved to disk.

## Routing

Call `generate_image` for requests like:

- “create an image of …”
- “generate a logo/icon/illustration/poster …”
- “draw/render/make me a PNG/WebP/JPEG …”

Do **not** use it for:

- SVG illustrations the user wants as editable vector code
- Mermaid, Graphviz, Excalidraw, or architecture diagrams unless the user explicitly asks for a bitmap render
- image analysis of an existing image

## Defaults

- Save outputs under `/Users/brandon/Pictures/gpt-images/` unless the user specifies a path.
- Prefer descriptive filenames, e.g. `generated-images/retro-terminal-mascot.png`.
- Use `1024x1024` for square assets, `1536x1024` for landscape, and `1024x1536` for portrait unless the user asks otherwise.
- Use `outputFormat: "png"` unless JPEG/WebP is requested.

## Prompting

Before calling the tool, turn vague user requests into a concrete image prompt with:

- subject and composition
- visual style or medium
- colors, lighting, mood
- important constraints from the user
- aspect ratio implied by the selected size

If a request is underspecified but still workable, make a reasonable creative choice and proceed. Ask a clarifying question only when the missing detail would materially change the result.

## Requirements

The tool delegates to `codex exec`, so it requires Codex CLI to be installed and logged in with image generation available. It does not require `OPENAI_API_KEY` for normal use. If generation fails because Codex is unavailable or not logged in, tell the user to run `codex login` and retry after `/reload` if the extension changed.
