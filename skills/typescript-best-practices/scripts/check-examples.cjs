#!/usr/bin/env node
// Use an existing TypeScript installation: node check-examples.cjs /path/to/typescript.js [prefix ...]
const fs = require('node:fs');
const path = require('node:path');
const ts = require(process.argv[2] || 'typescript');
const root = path.resolve(__dirname, '..');
const prefixes = process.argv.slice(3);
let checked = 0;
let blocksChecked = 0;
const failures = [];
for (const name of fs.readdirSync(path.join(root, 'rules')).sort()) {
  if (!name.endsWith('.md') || (prefixes.length && !prefixes.some(prefix => name.startsWith(prefix)))) continue;
  const text = fs.readFileSync(path.join(root, 'rules', name), 'utf8');
  const blocks = [...text.matchAll(/```(?:typescript|ts)\n([\s\S]*?)```/g)];
  blocksChecked += blocks.length;
  // Explicit file markers within one page form a shared example project.
  const marked = blocks.filter(block => /^\/\/ file: /m.test(block[1]));
  const examples = blocks.filter(block => !/^\/\/ file: /m.test(block[1])).map(block => block[1]);
  if (marked.length) examples.push(marked.map(block => block[1]).join("\n"));
  for (let index = 0; index < examples.length; index++) {
    const code = examples[index];
    const base = '/__skill_example__/';
    const sources = new Map();
    const markers = [...code.matchAll(/^\/\/ file: (.+)$/gm)];
    if (markers.length) {
      for (let i = 0; i < markers.length; i++) {
        const marker = markers[i];
        const filename = path.posix.resolve(base, marker[1].trim());
        sources.set(filename, code.slice(marker.index + marker[0].length, markers[i + 1]?.index ?? code.length));
      }
    } else sources.set(base + 'example.ts', code + '\nexport {};\n');
    const options = { strict: true, noUncheckedIndexedAccess: true, noEmit: true, skipLibCheck: false, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, types: [], isolatedModules: name === "config-isolated-modules.md", verbatimModuleSyntax: name === "config-verbatim-module-syntax.md" };
    const host = ts.createCompilerHost(options);
    const originalRead = host.readFile.bind(host);
    const originalExists = host.fileExists.bind(host);
    const originalDirExists = host.directoryExists?.bind(host);
    host.readFile = file => sources.get(file) ?? originalRead(file);
    host.fileExists = file => sources.has(file) || originalExists(file);
    host.directoryExists = dir => [...sources.keys()].some(file => file.startsWith(dir + '/')) || (originalDirExists?.(dir) ?? false);
    host.getSourceFile = (file, version) => {
      const contents = host.readFile(file);
      return contents === undefined ? undefined : ts.createSourceFile(file, contents, version, true);
    };
    const program = ts.createProgram([...sources.keys()], options, host);
    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length) failures.push(`${name} block ${index + 1}:\n${ts.formatDiagnostics(diagnostics, {getCanonicalFileName: f => f, getCurrentDirectory: () => base, getNewLine: () => '\n'})}`);
    checked++;
  }
}
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
console.log(`${blocksChecked} TypeScript blocks in ${checked} example projects checked with TypeScript ${ts.version}; ${failures.length} failed`);
