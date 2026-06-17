#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DEFAULT_MAX_TEXT = 500;

function usage(exitCode = 0) {
  const out = exitCode === 0 ? console.log : console.error;
  out(`Usage:
  summarize-claude-jsonl.mjs <session.jsonl> [--max-text N] [--no-subagents]
  summarize-claude-jsonl.mjs --project-dir <claude-project-dir> --id <session-id> [--max-text N]

Outputs a deterministic Markdown recovery index for a Claude Code JSONL session.`);
  process.exit(exitCode);
}

function expandHome(value) {
  if (!value) return value;
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return value;
}

function parseArgs(argv) {
  const args = { maxText: DEFAULT_MAX_TEXT, subagents: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--project-dir') { args.projectDir = expandHome(argv[++i]); continue; }
    if (arg === '--id') { args.id = argv[++i]; continue; }
    if (arg === '--max-text') { args.maxText = Math.max(80, Number(argv[++i]) || DEFAULT_MAX_TEXT); continue; }
    if (arg === '--no-subagents') { args.subagents = false; continue; }
    if (!args.input) { args.input = expandHome(arg); continue; }
    usage(1);
  }
  if (!args.input && args.projectDir && args.id) args.input = path.join(args.projectDir, `${args.id}.jsonl`);
  if (!args.input) usage(1);
  return args;
}

function readJsonl(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  const records = [];
  for (let i = 0; i < lines.length; i++) {
    try { records.push({ line: i + 1, value: JSON.parse(lines[i]) }); }
    catch (error) { records.push({ line: i + 1, error: error.message, raw: lines[i].slice(0, 200) }); }
  }
  return records;
}

function truncate(text, max) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function contentText(content, maxText) {
  if (typeof content === 'string') return truncate(content, maxText);
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const item of content) {
    if (!item || typeof item !== 'object') continue;
    if (item.type === 'text') parts.push(item.text ?? '');
    else if (item.type === 'tool_use') parts.push(`[tool_use ${item.name ?? 'unknown'} id=${item.id ?? '?'}] ${JSON.stringify(item.input ?? {})}`);
    else if (item.type === 'tool_result') parts.push(`[tool_result id=${item.tool_use_id ?? '?'}] ${contentText(item.content, maxText)}`);
  }
  return truncate(parts.join('\n'), maxText);
}

function summarizeRecords(records, maxText) {
  const summary = {
    total: records.length,
    parseErrors: records.filter(r => r.error).length,
    users: [],
    assistants: [],
    toolUses: [],
    toolResults: [],
    taskNotifications: [],
    systemEvents: [],
    fileSnapshots: [],
    lastRecords: [],
  };
  const toolNamesById = new Map();

  for (const rec of records) {
    if (rec.error) continue;
    const msg = rec.value.message ?? {};
    if (!Array.isArray(msg.content)) continue;
    for (const item of msg.content) {
      if (item?.type === 'tool_use' && item.id) toolNamesById.set(item.id, item.name ?? 'unknown');
    }
  }

  for (const rec of records) {
    if (rec.error) continue;
    const obj = rec.value;
    const type = obj.type;
    const msg = obj.message ?? {};
    const content = msg.content;
    const text = contentText(content, maxText);
    const resultItems = Array.isArray(content) ? content.filter(item => item?.type === 'tool_result') : [];
    const onlyToolResults = resultItems.length > 0 && Array.isArray(content) && content.every(item => item?.type === 'tool_result');
    const askAnswer = resultItems.some(item => toolNamesById.get(item.tool_use_id) === 'AskUserQuestion');

    if (type === 'user' && text && !obj.isMeta && (!onlyToolResults || askAnswer)) {
      summary.users.push({ line: rec.line, timestamp: obj.timestamp, text: askAnswer ? `[AskUserQuestion answer] ${text}` : text });
    }
    if (type === 'assistant' && text) summary.assistants.push({ line: rec.line, timestamp: obj.timestamp, text });
    if (Array.isArray(content)) {
      for (const item of content) {
        if (!item || typeof item !== 'object') continue;
        if (item.type === 'tool_use') summary.toolUses.push({ line: rec.line, timestamp: obj.timestamp, name: item.name, id: item.id, input: truncate(JSON.stringify(item.input ?? {}), maxText) });
        if (item.type === 'tool_result') summary.toolResults.push({ line: rec.line, timestamp: obj.timestamp, name: toolNamesById.get(item.tool_use_id), id: item.tool_use_id, text: contentText(item.content, maxText) });
      }
    }
    if (obj.isMeta && text.includes('<task-notification>')) summary.taskNotifications.push({ line: rec.line, timestamp: obj.timestamp, text });
    if (type === 'system') summary.systemEvents.push({ line: rec.line, timestamp: obj.timestamp, subtype: obj.subtype, text: truncate(obj.error ?? obj.message ?? '', maxText) });
    if (type === 'file-history-snapshot') summary.fileSnapshots.push({ line: rec.line, timestamp: obj.timestamp, text: truncate(JSON.stringify(obj.snapshot ?? {}), maxText) });
  }

  summary.lastRecords = records.slice(-8).map(rec => rec.error
    ? { line: rec.line, type: 'parse-error', text: rec.raw }
    : { line: rec.line, type: rec.value.type, timestamp: rec.value.timestamp, text: contentText(rec.value.message?.content, maxText) || truncate(rec.value.error ?? rec.value.subtype ?? '', maxText) });
  return summary;
}

function printList(title, rows, formatter, maxRows = 12) {
  console.log(`\n## ${title}`);
  if (!rows.length) { console.log('- none observed'); return; }
  for (const row of rows.slice(0, maxRows)) console.log(`- ${formatter(row)}`);
  if (rows.length > maxRows) console.log(`- … ${rows.length - maxRows} more`);
}

function findSubagentFiles(sessionFile) {
  const sessionId = path.basename(sessionFile, '.jsonl');
  const dir = path.join(path.dirname(sessionFile), sessionId, 'subagents');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(name => name.endsWith('.jsonl'))
    .sort()
    .map(name => path.join(dir, name));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const sessionFile = path.resolve(args.input);
  const records = readJsonl(sessionFile);
  const summary = summarizeRecords(records, args.maxText);

  console.log(`# Claude Code session recovery index\n`);
  console.log(`- Session file: \`${sessionFile}\``);
  console.log(`- Records: ${summary.total}`);
  if (summary.parseErrors) console.log(`- Parse errors: ${summary.parseErrors}`);

  printList('User asks / answers', summary.users, r => `line ${r.line}: ${r.text}`);
  printList('Assistant substantive text', summary.assistants, r => `line ${r.line}: ${r.text}`);
  printList('Tool uses', summary.toolUses, r => `line ${r.line}: ${r.name} ${r.id ? `(${r.id}) ` : ''}${r.input}`);
  printList('Tool results', summary.toolResults, r => `line ${r.line}: ${r.name ?? 'tool'} ${r.id ? `(${r.id}) ` : ''}${r.text}`);
  printList('Task notifications', summary.taskNotifications, r => `line ${r.line}: ${r.text}`);
  printList('System events', summary.systemEvents, r => `line ${r.line}: ${r.subtype ?? 'system'} ${r.text}`);
  printList('File snapshots', summary.fileSnapshots, r => `line ${r.line}: ${r.text}`);
  printList('Tail records', summary.lastRecords, r => `line ${r.line} [${r.type}]: ${r.text || '(no text)'}`);

  if (args.subagents) {
    const subagentFiles = findSubagentFiles(sessionFile);
    console.log(`\n## Subagent logs`);
    if (!subagentFiles.length) console.log('- none observed');
    for (const file of subagentFiles) {
      const sub = summarizeRecords(readJsonl(file), Math.min(args.maxText, 300));
      const finalText = [...sub.assistants].reverse().find(row => row.text)?.text ?? '(no assistant text)';
      const firstUser = sub.users[0]?.text ?? '(no user assignment)';
      console.log(`- \`${path.basename(file)}\`: ${sub.total} records; assignment: ${truncate(firstUser, 220)}; latest assistant: ${truncate(finalText, 220)}`);
    }
  }
}

main();
