/**
 * Path Picker Extension — autocomplete dropdown + insert at cursor
 *
 * Features:
 *   • /path command — fuzzy-search and insert a local git repo path
 *   • Ctrl+Shift+R — inserts /path trigger at cursor, opens autocomplete dropdown
 *   • Type "/path" anywhere in your prompt — autocomplete dropdown appears with repo paths
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
import { Container, Text, matchesKey, Key, truncateToWidth } from "@earendil-works/pi-tui";
import type { AutocompleteItem } from "@earendil-works/pi-tui";

// ── Config ───────────────────────────────────────────────────────────

/** Directories to scan one level deep */
const SHALLOW_DIRS = [
	"dev",
	"projects",
	"code",
	"workspace",
	"src",
	"repos",
	"github",
	"gitlab",
	"Documents",
];

/** Directories to scan recursively (up to maxDepth levels) */
const RECURSIVE_DIRS = [
	{ path: "personal", maxDepth: 4 },
	{ path: "work", maxDepth: 4 },
];

/** Specific repo paths to check directly */
const SPECIFIC_PATHS = [".dotfiles"];

const SCAN_HOME_IMMEDIATE = true;

// ── Repo Discovery ───────────────────────────────────────────────────

function isGitRepo(dir: string): boolean {
	return existsSync(join(dir, ".git"));
}

function findGitReposRecursive(dir: string, maxDepth: number, currentDepth = 0): string[] {
	const repos: string[] = [];
	if (currentDepth >= maxDepth) return repos;

	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			if (entry.name.startsWith(".")) continue;
			// Skip common non-repo directories
			if (["node_modules", "vendor", "dist", "build", "target", "out", "coverage"].includes(entry.name)) continue;

			const fullPath = join(dir, entry.name);
			if (isGitRepo(fullPath)) {
				repos.push(fullPath);
			} else {
				repos.push(...findGitReposRecursive(fullPath, maxDepth, currentDepth + 1));
			}
		}
	} catch {
		/* ignore permission errors */
	}

	return repos;
}

function findGitRepos(): string[] {
	const repos = new Set<string>();
	const home = homedir();

	// 1. Immediate subdirectories of home (e.g. ~/.dotfiles won't match because it starts with ".")
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

	// 2. Specific one-off repos (including hidden ones like ~/.dotfiles)
	for (const specific of SPECIFIC_PATHS) {
		const fullPath = join(home, specific);
		if (existsSync(fullPath) && isGitRepo(fullPath)) {
			repos.add(fullPath);
		}
	}

	// 3. Shallow scan: one level deep
	for (const parent of SHALLOW_DIRS) {
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

	// 4. Recursive scan: any depth up to maxDepth
	for (const { path, maxDepth } of RECURSIVE_DIRS) {
		const parentPath = join(home, path);
		if (!existsSync(parentPath)) continue;
		for (const repo of findGitReposRecursive(parentPath, maxDepth)) {
			repos.add(repo);
		}
	}

	return Array.from(repos).sort((a, b) => a.localeCompare(b));
}

let cachedRepos: string[] | null = null;

function getRepos(): string[] {
	if (!cachedRepos) {
		cachedRepos = findGitRepos();
	}
	return cachedRepos;
}

function shortenHome(path: string): string {
	const home = homedir();
	return path.startsWith(home) ? path.replace(home, "~") : path;
}

// ── Autocomplete ─────────────────────────────────────────────────────

const TOKEN_SEPARATORS = new Set([" ", "\t", "\n", "(", "[", "{"]);

function getCurrentToken(text: string): { token: string; tokenStart: number } {
	let tokenStart = text.length;
	while (tokenStart > 0 && !TOKEN_SEPARATORS.has(text[tokenStart - 1] ?? "")) {
		tokenStart -= 1;
	}
	return { token: text.slice(tokenStart), tokenStart };
}

function getPathAutocompletePrefix(textBeforeCursor: string): string | undefined {
	const { token } = getCurrentToken(textBeforeCursor);

	if (
		token.startsWith("/path") &&
		(token.length === 5 || token[5] === " " || token[5] === "\t")
	) {
		return token;
	}

	return undefined;
}

function getPathAutocompleteItems(repos: string[], prefix: string) {
	const query = prefix.slice("/path".length).trim().toLowerCase();

	return repos
		.map((path) => ({
			value: path,
			label: shortenHome(path),
		}))
		.filter(
			(item) => !query || fuzzyMatch(query, item.label) || fuzzyMatch(query, item.value),
		)
		.slice(0, 15)
		.map((item) => ({
			value: item.value,
			label: item.label,
			description: item.value,
		}));
}

type AutocompleteTriggerableEditor = CustomEditor & { tryTriggerAutocomplete(): void };

class PathAutocompleteEditor extends CustomEditor {
	override handleInput(data: string): void {
		super.handleInput(data);
		this.triggerPathAutocomplete();
	}

	private triggerPathAutocomplete(): void {
		if (this.isShowingAutocomplete()) return;

		const cursor = this.getCursor();
		const line = this.getLines()[cursor.line] ?? "";
		const beforeCursor = line.slice(0, cursor.col);
		const prefix = getPathAutocompletePrefix(beforeCursor);
		if (!prefix) return;

		(this as AutocompleteTriggerableEditor).tryTriggerAutocomplete();
	}
}

// ── Fuzzy Match ──────────────────────────────────────────────────────

/** Simple fuzzy match: every query char must appear in order in the text */
function fuzzyMatch(query: string, text: string): boolean {
	let qi = 0;
	let ti = 0;
	const q = query.toLowerCase();
	const t = text.toLowerCase();
	while (qi < q.length && ti < t.length) {
		if (q[qi] === t[ti]) qi++;
		ti++;
	}
	return qi === q.length;
}

// ── Extension Entrypoint ─────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	/** Reference to the current session's editor (for insert-at-cursor) */
	let currentEditor: CustomEditor | null = null;

	// Install autocomplete provider + custom editor for auto-triggering
	pi.on("session_start", (_event, ctx) => {
		cachedRepos = null;

		ctx.ui.addAutocompleteProvider((current) => ({
			async getSuggestions(lines, cursorLine, cursorCol, options) {
				const line = lines[cursorLine] ?? "";
				const beforeCursor = line.slice(0, cursorCol);
				const prefix = getPathAutocompletePrefix(beforeCursor);

				if (!prefix) return current.getSuggestions(lines, cursorLine, cursorCol, options);

				const items = getPathAutocompleteItems(getRepos(), prefix);
				if (items.length === 0)
					return current.getSuggestions(lines, cursorLine, cursorCol, options);

				return { prefix, items };
			},
			applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
				// Only handle /path completions — delegate commands, @refs, etc. to default
				if (!prefix.startsWith("/path")) {
					return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
				}

				const line = lines[cursorLine] ?? "";
				const prefixStart = cursorCol - prefix.length;
				if (prefixStart >= 0 && line.slice(prefixStart, cursorCol) === prefix) {
					const before = line.slice(0, prefixStart);
					const after = line.slice(cursorCol);
					const newLine = before + item.value + after;
					const newLines = [...lines];
					newLines[cursorLine] = newLine;
					return {
						lines: newLines,
						cursorLine,
						cursorCol: prefixStart + item.value.length,
					};
				}
				return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
			},
			shouldTriggerFileCompletion(_lines, _cursorLine, _cursorCol) {
				return false;
			},
		}));

		ctx.ui.setEditorComponent((tui, theme, keybindings) => {
			currentEditor = new PathAutocompleteEditor(tui, theme, keybindings);
			return currentEditor;
		});
	});

	// ── /path command (standalone) ───────────────────────────────────
	pi.registerCommand("path", {
		description: "Fuzzy-search and insert a local git repo path",
		getArgumentCompletions: (prefix): AutocompleteItem[] | null => {
			const repos = getRepos();
			const query = prefix.toLowerCase();
			const items = repos.map((path) => ({
				value: path,
				label: shortenHome(path),
			}));
			const filtered = items.filter(
				(item) => fuzzyMatch(query, item.label) || fuzzyMatch(query, item.value),
			);
			return filtered.length > 0 ? filtered.slice(0, 15) : null;
		},
		handler: async (args, ctx) => {
			const repos = getRepos();
			const query = (args ?? "").trim().toLowerCase();

			// If args provided, try to find a matching repo directly
			if (query) {
				const match = repos.find(
					(path) => fuzzyMatch(query, shortenHome(path)) || fuzzyMatch(query, path),
				);
				if (match) {
					ctx.ui.setEditorText(match);
					ctx.ui.notify(`Inserted: ${shortenHome(match)}`, "info");
					return;
				}
			}

			// No match — insert trigger so autocomplete dropdown appears
			ctx.ui.setEditorText("/path ");
			ctx.ui.notify("Type to filter repos, then select from dropdown", "info");
		},
	});

	// ── Ctrl+Shift+R — insert trigger at cursor ──────────────────────
	pi.registerShortcut("ctrl+shift+r", {
		description: "Insert /path trigger at cursor to open repo autocomplete",
		handler: async (ctx) => {
			if (!currentEditor) {
				ctx.ui.notify("Editor not ready", "error");
				return;
			}
			currentEditor.insertTextAtCursor("/path ");
			ctx.ui.notify("Type to filter repos, then select from dropdown", "info");
		},
	});
}
