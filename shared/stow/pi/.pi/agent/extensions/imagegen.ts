import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { StringEnum } from "@mariozechner/pi-ai";
import type { ExecResult, ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { withFileMutationQueue } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "typebox";

type ImageFormat = "png" | "jpeg" | "webp";

type GenerateImageDetails = {
  backend: "codex";
  prompt: string;
  outputPath: string;
  size?: string;
  quality?: string;
  background?: string;
  outputFormat: ImageFormat;
  bytes: number;
  detectedFormat: string;
  codexExitCode: number;
  codexLastMessagePath: string;
};

const DEFAULT_OUTPUT_DIR = "/Users/brandon/Pictures/gpt-images";
const DEFAULT_FORMAT: ImageFormat = "png";
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

const GenerateImageParams = Type.Object({
  prompt: Type.String({ description: "Detailed prompt describing the image to generate." }),
  outputPath: Type.Optional(
    Type.String({
      description: `Where to save the generated image. Relative paths resolve against cwd. Defaults to ${DEFAULT_OUTPUT_DIR}/image-<timestamp>.<format>.`,
    }),
  ),
  model: Type.Optional(
    Type.String({
      description: "Ignored for the Codex-backed implementation; kept for compatibility with prior generate_image calls.",
    }),
  ),
  size: Type.Optional(
    Type.String({
      description: "Desired image size/aspect ratio, e.g. 1024x1024, 1536x1024, 1024x1536, or auto.",
      default: "1024x1024",
    }),
  ),
  quality: Type.Optional(
    Type.String({
      description: "Desired quality hint, e.g. low, medium, high, auto, standard, or hd.",
    }),
  ),
  background: Type.Optional(
    Type.String({
      description: "Desired background hint, e.g. transparent, opaque, chroma-key, or auto.",
    }),
  ),
  outputFormat: Type.Optional(
    StringEnum(["png", "jpeg", "webp"] as const, {
      description: "Desired bitmap file format. Default: png.",
      default: DEFAULT_FORMAT,
    }),
  ),
  timeoutMs: Type.Optional(Type.Number({ description: `Codex execution timeout in milliseconds. Default: ${DEFAULT_TIMEOUT_MS}.` })),
});

function stripAt(path: string): string {
  return path.startsWith("@") ? path.slice(1) : path;
}

function inferOutputFormat(outputPath: string | undefined, requestedFormat: ImageFormat | undefined): ImageFormat {
  if (requestedFormat) return requestedFormat;

  const extension = extname(stripAt(outputPath?.trim() ?? "")).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "jpeg";
  if (extension === ".webp") return "webp";
  return DEFAULT_FORMAT;
}

function resolveOutputPath(cwd: string, outputPath: string | undefined, outputFormat: ImageFormat): string {
  const path = outputPath?.trim()
    ? stripAt(outputPath.trim())
    : `${DEFAULT_OUTPUT_DIR}/image-${new Date().toISOString().replace(/[:.]/g, "-")}.${outputFormat}`;

  return isAbsolute(path) ? path : resolve(cwd, path);
}

function withDefaultExtension(path: string, outputFormat: ImageFormat): string {
  if (extname(path)) return path;
  return `${path}.${outputFormat}`;
}

function isWithin(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function codexPrompt(params: {
  prompt: string;
  outputPath: string;
  outputFormat: ImageFormat;
  size?: string;
  quality?: string;
  background?: string;
}): string {
  return `You are being invoked by Pi's generate_image tool as a subscription-backed image-generation backend.

Use Codex's built-in hosted image generation tool to create a real bitmap image. Do not use SVG, HTML, CSS, ASCII art, a programmatic placeholder, or the OpenAI API/CLI fallback. If the built-in hosted image generation tool is unavailable, respond exactly: IMAGE_TOOL_UNAVAILABLE.

Save or copy the final generated bitmap exactly to this path:
${params.outputPath}

Required format: ${params.outputFormat}
Desired size/aspect ratio: ${params.size ?? "auto"}
Desired quality: ${params.quality ?? "high"}
Background hint: ${params.background ?? "auto"}

Image prompt:
${params.prompt}

After saving, verify the destination with a filesystem check such as \`file ${params.outputPath}\`. Your final response should only report the saved path.`;
}

function detectImageFormat(bytes: Buffer): string | undefined {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  return undefined;
}

async function validateGeneratedImage(path: string): Promise<{ bytes: number; detectedFormat: string }> {
  const fileStat = await stat(path);
  if (!fileStat.isFile() || fileStat.size === 0) throw new Error(`Codex did not create a non-empty file at ${path}.`);

  const header = await readFile(path);
  const detectedFormat = detectImageFormat(header);
  if (!detectedFormat) throw new Error(`Generated file is not a recognized PNG, JPEG, or WebP bitmap: ${path}`);

  return { bytes: fileStat.size, detectedFormat };
}

function codexFailureMessage(result: ExecResult, lastMessage: string): string {
  const parts = [
    result.stderr?.trim() ? `stderr:\n${result.stderr.trim()}` : undefined,
    result.stdout?.trim() ? `stdout:\n${result.stdout.trim().slice(-4000)}` : undefined,
    lastMessage.trim() ? `last message:\n${lastMessage.trim()}` : undefined,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join("\n\n") : "Codex exited without output.";
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "generate_image",
    label: "Generate Image",
    description:
      "Generate a bitmap image by delegating to Codex CLI's hosted image generation capability, then save it to disk. Requires Codex CLI to be installed and logged in.",
    promptSnippet: "Generate bitmap images by delegating to Codex CLI's hosted image generation and save them to local files.",
    promptGuidelines: [
      "Use generate_image when the user asks to create, generate, draw, render, or make a bitmap image file.",
      `When using generate_image, omit outputPath unless the user specified a path; default outputs are saved under ${DEFAULT_OUTPUT_DIR}/.`,
      "Do not use generate_image for SVG, Mermaid, Excalidraw, or text-only diagrams unless the user specifically wants a bitmap image.",
    ],
    parameters: GenerateImageParams,

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const outputFormat = inferOutputFormat(params.outputPath, params.outputFormat);
      const outputPath = withDefaultExtension(resolveOutputPath(ctx.cwd, params.outputPath, outputFormat), outputFormat);
      const lastMessagePath = join(tmpdir(), `pi-codex-image-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);
      const timeout = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;

      onUpdate?.({ content: [{ type: "text", text: "Generating image via Codex..." }] });

      await mkdir(dirname(outputPath), { recursive: true });

      const args = [
        "exec",
        "--cd",
        ctx.cwd,
        "--sandbox",
        "workspace-write",
        "--skip-git-repo-check",
        "--output-last-message",
        lastMessagePath,
      ];
      if (!isWithin(ctx.cwd, outputPath)) args.push("--add-dir", dirname(outputPath));
      args.push(
        codexPrompt({
          prompt: params.prompt,
          outputPath,
          outputFormat,
          size: params.size,
          quality: params.quality,
          background: params.background,
        }),
      );

      const result = await withFileMutationQueue(outputPath, async () => {
        return (await pi.exec("codex", args, { cwd: ctx.cwd, timeout, signal })) as ExecResult;
      });

      const lastMessage = await readFile(lastMessagePath, "utf8").catch(() => "");
      if (result.code !== 0 || lastMessage.trim() === "IMAGE_TOOL_UNAVAILABLE") {
        throw new Error(`Codex image generation failed.\n${codexFailureMessage(result, lastMessage)}`);
      }

      const validation = await validateGeneratedImage(outputPath);
      const details: GenerateImageDetails = {
        backend: "codex",
        prompt: params.prompt,
        outputPath,
        size: params.size,
        quality: params.quality,
        background: params.background,
        outputFormat,
        bytes: validation.bytes,
        detectedFormat: validation.detectedFormat,
        codexExitCode: result.code,
        codexLastMessagePath: lastMessagePath,
      };

      return {
        content: [{ type: "text", text: `Generated image saved to ${outputPath}` }],
        details,
      };
    },

    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("generate_image "));
      const prompt = typeof args.prompt === "string" ? args.prompt : "";
      text += theme.fg("accent", prompt.length > 72 ? `${prompt.slice(0, 69)}...` : prompt);
      text += theme.fg("muted", " via Codex");
      if (args.outputPath) text += theme.fg("muted", ` → ${args.outputPath}`);
      return new Text(text, 0, 0);
    },

    renderResult(result, { isPartial, expanded }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Generating image via Codex..."), 0, 0);

      const details = result.details as GenerateImageDetails | undefined;
      if (!details) return new Text(theme.fg("success", "Generated image"), 0, 0);

      let text = theme.fg("success", `Generated image: ${details.outputPath}`);
      if (expanded) {
        text += `\n${theme.fg("dim", `backend: ${details.backend}`)}`;
        text += `\n${theme.fg("dim", `format: ${details.detectedFormat}`)}`;
        text += `\n${theme.fg("dim", `bytes: ${details.bytes}`)}`;
        if (details.size) text += `\n${theme.fg("dim", `size: ${details.size}`)}`;
        if (details.quality) text += `\n${theme.fg("dim", `quality: ${details.quality}`)}`;
      }
      return new Text(text, 0, 0);
    },
  });
}
