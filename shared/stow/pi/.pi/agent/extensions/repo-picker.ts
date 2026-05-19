/**
 * Repo Picker Extension — fuzzy filtering + insert at cursor
 *
 * Features:
 *   • /repo command — opens fuzzy picker, replaces editor text with selected path
 *   • Ctrl+Shift+R — opens fuzzy picker, inserts selected path at cursor position
 *
 * The picker scans ~/* and common parent dirs (~/dev, ~/projects, ~/code, etc.)
 * one level deep for git repositories.
 *
 * Install: ~/.pi/agent/extensions/repo-picker.ts
 * Activate: /reload in pi, or restart pi
 */

import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { CustomEditor, DynamicBorder } from "@earendil-works/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text, matchesKey, Key } from "@earendil-works/pi-tui";

// ── Config ───────────────────────────────────────────────────────────

const PARENT_DIRS = [
	"dev",
	"projects",
	"code",
	"workspace",
	"src",
	"repos",
	"github",
	"gitlab",
	"work",
	"Documents",
];

const SCAN_HOME_IMMEDIATE = true;

// ── Repo Discovery ───────────────────────────────────────────────────

function isGitRepo(dir: string): boolean {
	return existsSync(join(dir, ".git"));
}

function findGitRepos(): string[] {
	const repos = new Set<string>();
	const home = homedir();

	if (SCAN_HOME_IMMEDIATE) {
		try {
			const entries = readdirSync(home, { withFileTypes: true });
			for (const entry of entries) {
				if (entry.isDirectory() && !entry.name.startsWith(".")) {
					const fullPath = join(home, entry.name);
					if (isGitRepo(fullPath)) repos.add(fullPath);
				}
			}
		} catch {
			/* ignore permission errors */
		}
	}

	for (const parent of PARENT_DIRS) {
		const parentPath = join(home, parent);
		if (!existsSync(parentPath)) continue;

		try {
			const entries = readdirSync(parentPath, { withFileTypes: true });
			for (const entry of entries) {
				if (entry.isDirectory() && !entry.name.startsWith(".")) {
					const fullPath = join(parentPath, entry.name);
					if (isGitRepo(fullPath)) repos.add(fullPath);
				}
			}
		} catch {
			/* ignore permission errors */
		}
	}

	return Array.from(repos).sort((a, b) => a.localeCompare(b));
}

function shortenHome(path: string): string {
	const home = homedir();
	return path.startsWith(home) ? path.replace(home, "~") : path;
}

// ── Fuzzy Picker Overlay ─────────────────────────────────────────────

class RepoPickerOverlay {
	private theme: Theme;
	private done: (value: string | null) => void;
	private searchQuery = "";
	private selectList: SelectList;
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(theme: Theme, items: SelectItem[], done: (value: string | null) => void) {
		this.theme = theme;
		this.done = done;

		this.selectList = new SelectList(
			items,
			Math.min(items.length, 12),
			{
				selectedPrefix: (t) => theme.fg("accent", t),
				selectedText: (t) => theme.fg("accent", t),
				description: (t) => theme.fg("muted", t),
				scrollInfo: (t) => theme.fg("dim", t),
				noMatch: (t) => theme.fg("warning", t),
			},
		);

		this.selectList.onSelect = (item) => this.done(item.value);
		this.selectList.onCancel = () => this.done(null);
	}

	handleInput(data: string): void {
		// Cancel
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
			this.done(null);
			return;
		}

		// Navigation / selection — let SelectList handle it
		if (
			matchesKey(data, Key.up) ||
			matchesKey(data, Key.down) ||
			matchesKey(data, Key.enter)
		) {
			this.selectList.handleInput(data);
			this.invalidate();
			return;
		}

		// Backspace
		if (matchesKey(data, Key.backspace)) {
			if (this.searchQuery.length > 0) {
				this.searchQuery = this.searchQuery.slice(0, -1);
				this.selectList.setFilter(this.searchQuery);
				this.invalidate();
			}
			return;
		}

		// Printable character (skip control chars and DEL)
		if (data.length === 1 && data.charCodeAt(0) >= 32 && data.charCodeAt(0) !== 127) {
			this.searchQuery += data;
			this.selectList.setFilter(this.searchQuery);
			this.invalidate();
		}
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const container = new Container();
		const th = this.theme;

		// Top border
		container.addChild(new DynamicBorder((s: string) => th.fg("accent", s)));

		// Title
		container.addChild(
			new Text(th.fg("accent", th.bold("Select Git Repo")), 1, 0),
		);

		// Separator
		container.addChild(new DynamicBorder((s: string) => th.fg("borderMuted", s)));

		// Search box
		const searchDisplay = this.searchQuery || th.fg("dim", "type to filter…");
		container.addChild(new Text(th.fg("text", `> ${searchDisplay}`), 1, 0));

		// Separator
		container.addChild(new DynamicBorder((s: string) => th.fg("borderMuted", s)));

		// List (render at width minus padding)
		const listLines = this.selectList.render(width - 2);
		for (const line of listLines) {
			container.addChild(new Text(line, 1, 0));
		}

		// Bottom border
		container.addChild(new DynamicBorder((s: string) => th.fg("accent", s)));

		// Help text
		container.addChild(
			new Text(
				th.fg("dim", "↑↓ navigate • enter select • esc cancel"),
				1,
				0,
			),
		);

		this.cachedWidth = width;
		this.cachedLines = container.render(width);
		return this.cachedLines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
		this.selectList.invalidate();
	}
}

// ── Shared Picker Logic ──────────────────────────────────────────────

async function showRepoPicker(ctx: ExtensionContext): Promise<string | null> {
	if (!ctx.hasUI) {
		ctx.ui.notify("repo picker requires interactive mode", "error");
		return null;
	}

	const repos = findGitRepos();
	if (repos.length === 0) {
		ctx.ui.notify(
			"No git repos found. Checked: ~/*, ~/dev, ~/projects, ~/code, etc.",
			"warning",
		);
		return null;
	}

	const items: SelectItem[] = repos.map((path) => ({
		value: path,
		label: shortenHome(path),
	}));

	return ctx.ui.custom<string | null>(
		(tui, theme, _kb, done) => {
			const overlay = new RepoPickerOverlay(theme, items, done);
			return {
				render: (w) => overlay.render(w),
				invalidate: () => overlay.invalidate(),
				handleInput: (data) => {
					overlay.handleInput(data);
					tui.requestRender();
				},
			};
		},
		{ overlay: true },
	);
}

// ── Extension Entrypoint ─────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	/** Reference to the current session's editor (for insert-at-cursor) */
	let currentEditor: CustomEditor | null = null;

	/** Track whether picker is already open to prevent nested overlays */
	let isPickerOpen = false;

	// Install a thin CustomEditor wrapper so we can insert at cursor later
	pi.on("session_start", (_event, ctx) => {
		ctx.ui.setEditorComponent((tui, theme, keybindings) => {
			currentEditor = new CustomEditor(tui, theme, keybindings);
			return currentEditor;
		});
	});

	// /repo — replace editor text
	pi.registerCommand("repo", {
		description: "Fuzzy-search and insert a local git repo path",
		handler: async (_args, ctx) => {
			if (isPickerOpen) return;
			isPickerOpen = true;
			try {
				const result = await showRepoPicker(ctx);
				if (result) {
					ctx.ui.setEditorText(result);
					ctx.ui.notify(`Inserted: ${shortenHome(result)}`, "info");
				}
			} finally {
				isPickerOpen = false;
			}
		},
	});

	// Ctrl+Shift+R — insert at cursor
	pi.registerShortcut("ctrl+shift+r", {
		description: "Open git repo picker and insert at cursor",
		handler: async (ctx) => {
			if (isPickerOpen) return;
			if (!currentEditor) {
				ctx.ui.notify("Editor not ready", "error");
				return;
			}
			isPickerOpen = true;
			try {
				const result = await showRepoPicker(ctx);
				if (result) {
					currentEditor.insertTextAtCursor(result);
					ctx.ui.notify(`Inserted at cursor: ${shortenHome(result)}`, "info");
				}
			} finally {
				isPickerOpen = false;
			}
		},
	});
}
