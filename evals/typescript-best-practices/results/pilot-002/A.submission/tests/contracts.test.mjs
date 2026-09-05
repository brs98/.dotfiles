import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import ts from '/home/brandon/personal/typescript-doctor/node_modules/typescript/lib/typescript.js';

const root = path.resolve(import.meta.dirname, '..');
const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
assert.deepEqual(parsed.errors, []);

function diagnostics(source) {
  const filename = path.join(root, 'src', '__contract_test__.ts');
  const options = { ...parsed.options, noEmit: true };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, languageVersion, onError, shouldCreateNewSourceFile) =>
    name === filename
      ? ts.createSourceFile(name, source, languageVersion, true)
      : getSourceFile(name, languageVersion, onError, shouldCreateNewSourceFile);
  return ts.getPreEmitDiagnostics(ts.createProgram([...parsed.fileNames, filename], options, host));
}

test('public type contracts preserve precise types and key domains', () => {
  const errors = diagnostics(`
    import { getProperty, lookupLabel } from './client.js';
    import type { Headers, StringDictionary, DeliveryStatus } from './client.js';
    type Equal<A, B> =
      (<T>() => T extends A ? 1 : 2) extends
      (<T>() => T extends B ? 1 : 2) ? true : false;
    type Check<T extends true> = T;
    const symbol = Symbol('key');
    const value: { readonly name: 'literal'; readonly 2: number; readonly [symbol]: boolean; optional?: string } =
      { name: 'literal', 2: 42, [symbol]: true };
    const name = getProperty(value, 'name');
    const number = getProperty(value, 2);
    const boolean = getProperty(value, symbol);
    const optional = getProperty(value, 'optional');
    type Name = Check<Equal<typeof name, 'literal'>>;
    type Numeric = Check<Equal<typeof number, number>>;
    type Symbolic = Check<Equal<typeof boolean, boolean>>;
    type Optional = Check<Equal<typeof optional, string | undefined>>;
    type DictionaryKeys = Check<Equal<keyof StringDictionary, string | number>>;
    type Status = Check<Equal<DeliveryStatus, 'queued' | 'delivered'>>;
    const headers: Headers = { requestId: 'id', source: 'test' };
    const record: Record<string, string> = headers;
    const labels: ReadonlyMap<string, string> = new Map();
    const label: string = lookupLabel(labels, 'id', 'fallback');
  `);
  assert.deepEqual(errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')), []);
});

test('property selection rejects absent string, number, and symbol keys', () => {
  for (const key of ["'missing'", '7', "Symbol('missing')"]) {
    const errors = diagnostics(`
      import { getProperty } from './client.js';
      getProperty({ present: true }, ${key});
    `);
    assert.deepEqual(errors.map(error => error.code), [2345]);
  }
});
