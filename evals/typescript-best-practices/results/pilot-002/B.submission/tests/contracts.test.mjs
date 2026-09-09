import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from '/home/brandon/personal/typescript-doctor/node_modules/typescript/lib/typescript.js';

const root = path.resolve(import.meta.dirname, '..');
const clientPath = path.join(root, 'src/client.ts');
const checkPath = path.join(root, 'src/__contract_check__.ts');
const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
assert.deepEqual(parsed.errors, []);

// Virtual source files exercise both valid and invalid callers without suppressions.
function diagnostics(source, clientSource) {
  const options = { ...parsed.options, noEmit: true };
  const host = ts.createCompilerHost(options);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    const content = fileName === checkPath ? source : fileName === clientPath ? clientSource : undefined;
    if (content !== undefined) return ts.createSourceFile(fileName, content, languageVersion, true);
    return originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
  };
  return ts.getPreEmitDiagnostics(ts.createProgram([clientPath, checkPath], options, host));
}

test('selected property types and independent public contracts stay exact', () => {
  const errors = diagnostics(`
    import { getProperty, lookupLabel, parseEvent, parseEventJson } from './client.js';
    import type { DeliveryStatus, Event, Headers, StringDictionary } from './client.js';
    type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
      (<T>() => T extends B ? 1 : 2) ? true : false;
    type Check<T extends true> = T;
    declare const symbol: unique symbol;
    declare const value: { readonly name: 'literal'; readonly 0: 42; readonly [symbol]: true; readonly optional?: number };
    const name = getProperty(value, 'name');
    const numeric = getProperty(value, 0);
    const symbolic = getProperty(value, symbol);
    const optional = getProperty(value, 'optional');
    type Name = Check<Equal<typeof name, 'literal'>>;
    type Numeric = Check<Equal<typeof numeric, 42>>;
    type Symbolic = Check<Equal<typeof symbolic, true>>;
    type Optional = Check<Equal<typeof optional, number | undefined>>;
    type Keys = Check<Equal<keyof StringDictionary, string | number>>;
    type Status = Check<Equal<DeliveryStatus, 'queued' | 'delivered'>>;
    type Parsed = Check<Equal<ReturnType<typeof parseEvent>, Event>>;
    type Json = Check<Equal<ReturnType<typeof parseEventJson>, Event>>;
    declare const headers: Headers;
    const record: Record<string, string> = headers;
    declare const labels: ReadonlyMap<string, string>;
    const label: string = lookupLabel(labels, 'id', 'fallback');
  `);
  assert.deepEqual(errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')), []);
});

test('keys absent from the static object type are rejected', () => {
  for (const key of ["'absent'", '1', 'Symbol()']) {
    const errors = diagnostics(`import { getProperty } from './client.js'; getProperty({ name: '' }, ${key});`);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, 2345);
    assert.equal(errors[0].file.fileName, checkPath);
  }
});

test('a future Event variant forces an error at the exhaustive handler', () => {
  const original = readFileSync(clientPath, 'utf8');
  const expanded = original.replace('export type Event =', 'export type Event =\n  | { type: "future"; id: string }');
  assert.notEqual(expanded, original);
  const errors = diagnostics('', expanded);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 2345);
  assert.equal(errors[0].file.fileName, clientPath);
  assert.equal(expanded.slice(errors[0].start, errors[0].start + errors[0].length), 'event');
});
