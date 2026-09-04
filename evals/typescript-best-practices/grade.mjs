#!/usr/bin/env node
// Held-out requirement grader. Never run candidate package scripts or load its config.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const checks = [];
let compilerVersion = null;
let temporary;
let infrastructureErrors = 0;
let manualReview = 0;
let manualReviewDetails = [];
const add = (id, category, pass, detail) => checks.push({ id, category, pass, detail });
const prelude = `import { parseEvent, parseEventJson, formatEvent, getProperty, lookupLabel, queueLabel, defaultPreferences, exampleStatuses } from './client.js';
import type { Event, StringDictionary, Headers, DeliveryStatus } from './client.js';
type IsAny<T> = 0 extends (1 & T) ? true : false;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Check<T extends true> = T;
type NotAny<T> = IsAny<T> extends true ? false : true;
`;

const probes = [
  ['property-contract', `
const symbolKey: unique symbol = Symbol();
const value = { name: 'literal', count: 42, 7: { nested: true }, [symbolKey]: 'symbol' } as const;
const name = getProperty(value, 'name');
const count = getProperty(value, 'count');
const numeric = getProperty(value, 7);
const symbolic = getProperty(value, symbolKey);
type A = Check<Equal<typeof name, 'literal'>>;
type B = Check<Equal<typeof count, 42>>;
type C = Check<Equal<typeof numeric, { readonly nested: true }>>;
type D = Check<Equal<typeof symbolic, 'symbol'>>;
type E = Check<NotAny<typeof name>>;
type F = Check<NotAny<typeof symbolic>>;
const optional: { readonly label?: string } = {};
const result = getProperty(optional, 'label');
type G = Check<Equal<typeof result, string | undefined>>;
// @ts-expect-error absent string key
getProperty(value, 'missing');
// @ts-expect-error absent numeric key
getProperty(value, 8);
// @ts-expect-error absent symbol key
getProperty(value, Symbol());
`],
  ['event-contract', `
type Expected =
 | { type: 'created'; id: string; attempt: number; labels?: readonly string[] }
 | { type: 'retry'; id: string; delayMs: number }
 | { type: 'closed'; id: string; reason: string | null };
type A = Check<NotAny<Event>>;
type B = Check<Equal<Event, Expected>>;
type C = Check<Equal<Parameters<typeof parseEvent>[0], unknown>>;
type D = Check<Equal<ReturnType<typeof parseEvent>, Event>>;
type E = Check<NotAny<ReturnType<typeof parseEvent>>>;
type F = Check<Equal<Parameters<typeof parseEventJson>[0], string>>;
type G = Check<Equal<ReturnType<typeof parseEventJson>, Event>>;
type H = Check<NotAny<ReturnType<typeof parseEventJson>>>;
type I = Check<Equal<Parameters<typeof formatEvent>[0], Event>>;
type J = Check<Equal<ReturnType<typeof formatEvent>, string>>;
type K = Check<NotAny<Parameters<typeof parseEvent>[0]>>;
const parsed = parseEvent(Symbol());
const readonlyLabels: readonly string[] = ['a'];
const created: Event = { type: 'created', id: '', attempt: 0, labels: readonlyLabels };
// @ts-expect-error labels cannot explicitly be undefined
const invalid: Event = { type: 'created', id: '', attempt: 0, labels: undefined };
// @ts-expect-error missing reason
const missingReason: Event = { type: 'closed', id: '' };
// @ts-expect-error invalid variant
const other: Event = { type: 'other', id: '' };
// @ts-expect-error JSON input must be a string
parseEventJson(4);
`],
  ['map-and-callback-contract', `
const labels: ReadonlyMap<string, string> = new Map();
const label = lookupLabel(labels, 'a', 'fallback');
type A = Check<Equal<typeof label, string>>;
type B = Check<NotAny<typeof label>>;
type C = Check<Equal<Parameters<typeof lookupLabel>, [ReadonlyMap<string, string>, string, string]>>;
type D = Check<Equal<Parameters<typeof queueLabel>, [string | null, (callback: () => string) => void]>>;
type E = Check<Equal<ReturnType<typeof queueLabel>, void>>;
queueLabel(null, callback => { const value: string = callback(); });
// @ts-expect-error numeric label
queueLabel(3, () => {});
`],
  ['headers-contract', `
declare const headers: Headers;
const record: Record<string, string> = headers;
const valid: Headers = { requestId: 'r', source: 's' };
type A = Check<NotAny<Headers>>;
type B = Check<Equal<Headers['requestId'], string>>;
type C = Check<Equal<Headers['source'], string>>;
// @ts-expect-error required requestId
const missing: Headers = { source: 's' };
// @ts-expect-error invalid source
const invalid: Headers = { requestId: 'r', source: 1 };
`],
  ['dictionary-contract', `
type A = Check<Equal<keyof StringDictionary, string | number>>;
type B = Check<NotAny<StringDictionary>>;
type C = Check<Equal<StringDictionary[string], string>>;
const numeric: keyof StringDictionary = 12;
const text: keyof StringDictionary = 't';
// @ts-expect-error symbol excluded
const symbol: keyof StringDictionary = Symbol();
`],
  ['preferences-contract', `
type A = Check<NotAny<typeof defaultPreferences>>;
type B = Check<Equal<typeof defaultPreferences.theme, 'system'>>;
type C = Check<Equal<typeof defaultPreferences.retries, 3>>;
// @ts-expect-error readonly theme
defaultPreferences.theme = 'system';
// @ts-expect-error readonly retries
defaultPreferences.retries = 3;
`],
];
const statusProbe = `
type A = Check<NotAny<DeliveryStatus>>;
type B = Check<Equal<DeliveryStatus, 'queued' | 'delivered'>>;
const queued: DeliveryStatus = 'queued';
const delivered: DeliveryStatus = 'delivered';
// @ts-expect-error unknown delivery status
const unknown: DeliveryStatus = 'failed';
`;

// Each group reports its individual cases while scoring the requirement once.
const runtimeSource = String.raw`
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const module = await import(pathToFileURL(process.argv[1]).href);
const { parseEvent: parse, parseEventJson: json, formatEvent: format, getProperty, lookupLabel, queueLabel, defaultPreferences } = module;
const results = [];
async function group(id, cases) {
 const details = [];
 for (const [name, run] of cases) {
  try { await run(); details.push({ name, pass: true }); }
  catch (error) { details.push({ name, pass: false, error: String(error?.stack ?? error) }); }
 }
 results.push({ id, category: 'runtime', pass: details.every(x => x.pass), detail: details });
}
const rejects = input => assert.throws(() => parse(input), Error);
await group('valid-events', [
 ['all variants and boundary values', () => {
  for (const event of [
   { type: 'created', id: ' ', attempt: 0 },
   { type: 'created', id: 'x', attempt: 999, labels: [] },
   { type: 'created', id: 'x', attempt: 2, labels: ['', 'z'] },
   { type: 'retry', id: 'x', delayMs: 0 },
   { type: 'retry', id: 'x', delayMs: 0.125 },
   { type: 'closed', id: 'x', reason: null },
   { type: 'closed', id: 'x', reason: '' },
   { type: 'closed', id: 'x', reason: 'done' },
  ]) assert.deepEqual(parse(event), event);
 }],
]);
await group('invalid-object-type-id', [
 ['containers and primitive values', () => {
  for (const input of [null, undefined, [], Object.assign([], {type:'created', id:'x', attempt:0}), '', 0, true, Symbol(), () => {}]) rejects(input);
 }],
 ['discriminants', () => { for (const type of [undefined, null, 'unknown', '', 0, {}, ['created']]) rejects({type, id:'x', attempt:0}); }],
 ['required nonempty string id', () => { for (const id of [undefined, null, '', 0, {}, ['x'], new String('x')]) rejects({type:'created', id, attempt:0}); }],
]);
await group('created-attempt-validation', [
 ['finite nonnegative integer required', () => { for (const attempt of [undefined, null, NaN, Infinity, -Infinity, -1, .1, '1', true, {}, []]) rejects({type:'created', id:'x', attempt}); }],
 ['missing attempt', () => rejects({type:'created', id:'x'})],
]);
await group('created-label-validation', [
 ['only arrays containing strings', () => {
  const sparse = new Array(2);
  for (const labels of [undefined, null, 'a', {}, [1], ['a', null], [undefined], sparse]) rejects({type:'created', id:'x', attempt:0, labels});
 }],
 ['absence remains absence', () => assert.equal(Object.hasOwn(parse({type:'created', id:'x', attempt:0}), 'labels'), false)],
]);
await group('retry-and-closed-validation', [
 ['finite nonnegative delay', () => { for (const delayMs of [undefined, null, NaN, Infinity, -Infinity, -0.1, '1', true, {}, []]) rejects({type:'retry', id:'x', delayMs}); }],
 ['string or null reason required', () => { for (const reason of [undefined, 0, false, {}, [], new String('x')]) rejects({type:'closed', id:'x', reason}); }],
 ['missing fields', () => { rejects({type:'retry', id:'x'}); rejects({type:'closed', id:'x'}); }],
]);
await group('fresh-filtered-copies', [
 ['fresh objects and recognized fields only', () => {
  for (const base of [{type:'created', id:'x', attempt:0}, {type:'retry', id:'x', delayMs:.25}, {type:'closed', id:'x', reason:null}]) {
   const input = Object.freeze({...base, extra:'ignored', [Symbol('extra')]: 'ignored'});
   const result = parse(input);
   assert.notEqual(result, input); assert.deepEqual(result, base);
   assert.deepEqual(Reflect.ownKeys(result).sort(), Object.keys(base).sort());
  }
 }],
 ['labels copied in both directions', () => {
  const labels = ['a']; const input = {type:'created', id:'x', attempt:0, labels};
  const result = parse(input); assert.notEqual(result.labels, labels);
  labels.push('b'); assert.deepEqual(result.labels, ['a']);
  if (!Object.isFrozen(result.labels)) result.labels.push('c');
  assert.deepEqual(labels, ['a', 'b']);
  assert.deepEqual(parse({...input, labels:Object.freeze(['a'])}).labels, ['a']);
 }],
]);
await group('json-validation', [
 ['valid JSON applies normalization', () => assert.deepEqual(json('{"type":"created","id":"x","attempt":0,"extra":true}'), {type:'created', id:'x', attempt:0})],
 ['malformed or semantically invalid JSON', () => { for (const text of ['', '{', 'undefined', 'null', '[]', '{}', '{"type":"created","id":"x","attempt":-1}', '{"type":"closed","id":"x"}']) assert.throws(() => json(text), Error); }],
]);
await group('formatting', [
 ['exact variant rendering and nullish fallback', () => {
  for (const [event, output] of [
   [{type:'created', id:'a:b', attempt:0}, 'created:a:b:0'],
   [{type:'retry', id:'x', delayMs:.125}, 'retry:x:0.125'],
   [{type:'closed', id:'x', reason:null}, 'closed:x:unknown'],
   [{type:'closed', id:'x', reason:''}, 'closed:x:'],
   [{type:'closed', id:'x', reason:'done'}, 'closed:x:done'],
  ]) assert.equal(format(event), output);
 }],
]);
await group('map-fallback', [
 ['preserve present values and only fall back when missing', () => {
  const labels = new Map([['empty',''], ['a','Alpha']]);
  assert.equal(lookupLabel(labels,'empty','fallback'), '');
  assert.equal(lookupLabel(labels,'a','fallback'), 'Alpha');
  assert.equal(lookupLabel(labels,'missing','fallback'), 'fallback');
  assert.equal(lookupLabel(labels,'missing',''), '');
  assert.deepEqual([...labels], [['empty',''], ['a','Alpha']]);
 }],
]);
await group('deferred-callbacks', [
 ['null enqueues nothing', () => { const queued=[]; queueLabel(null, cb=>queued.push(cb)); assert.equal(queued.length,0); }],
 ['capture original non-null strings exactly once', async () => {
  for (const label of ['', 'value']) {
   const queued=[]; queueLabel(label, cb=>queued.push(cb)); assert.equal(queued.length,1);
   await Promise.resolve(); assert.equal(queued[0](),label); assert.equal(queued[0](),label);
  }
 }],
]);
await group('runtime-property-and-preferences', [
 ['symbol and number access', () => { const s=Symbol(); const value=Object.freeze({[s]:'symbol',7:'number',name:'name'}); assert.equal(getProperty(value,s),'symbol'); assert.equal(getProperty(value,7),'number'); }],
 ['preferences frozen with original values', () => { assert.deepEqual(defaultPreferences,{theme:'system',retries:3}); assert.equal(Object.isFrozen(defaultPreferences),true); }],
]);
process.stdout.write('\n__GRADER_RESULT__' + JSON.stringify(results) + '\n');
`;

async function copyCandidate(source, target, issues) {
 await fs.mkdir(target, { recursive: true });
 for (const entry of (await fs.readdir(source, {withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
  if (['dist','node_modules','.git'].includes(entry.name)) continue;
  const from=path.join(source,entry.name), to=path.join(target,entry.name);
  if (entry.isSymbolicLink()) { issues.push(`Symbolic link excluded: ${path.relative(temporary, to)}`); continue; }
  if (entry.isDirectory()) await copyCandidate(from,to,issues);
  else if (entry.isFile()) await fs.copyFile(from,to);
 }
}
async function runNode(args, cwd) {
 return await new Promise((resolve, reject) => {
  const child=spawn(process.execPath,args,{cwd,env:{PATH:process.env.PATH ?? '',NODE_NO_WARNINGS:'1'},stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',timedOut=false,tooMuchOutput=false;
  const capture=(kind, chunk)=>{
   if (kind==='stdout') stdout+=chunk; else stderr+=chunk;
   if (stdout.length+stderr.length > 2_000_000) { tooMuchOutput=true; child.kill('SIGKILL'); }
  };
  child.stdout.on('data',x=>capture('stdout',x)); child.stderr.on('data',x=>capture('stderr',x));
  const timer=setTimeout(()=>{timedOut=true; child.kill('SIGKILL');},10_000);
  child.on('error',error=>{clearTimeout(timer);reject(error);});
  child.on('close',(code,signal)=>{clearTimeout(timer);resolve({code,signal,timedOut,tooMuchOutput,stdout,stderr});});
 });
}

try {
 const [candidateArgument, compilerArgument]=process.argv.slice(2);
 if (!candidateArgument || !compilerArgument) throw new Error('Usage: node grade.mjs CANDIDATE_DIRECTORY TYPESCRIPT_PACKAGE_DIRECTORY');
 const candidate=path.resolve(candidateArgument);
 const ts=createRequire(import.meta.url)(path.join(path.resolve(compilerArgument),'lib/typescript.js'));
 compilerVersion=ts.version;
 const fixture=path.join(here,'fixture');
 const frozenConfig=JSON.parse(await fs.readFile(path.join(fixture,'tsconfig.json'),'utf8'));
 temporary=await fs.mkdtemp(path.join(os.tmpdir(),'typescript-grade-'));
 const workspace=path.join(temporary,'candidate');
 const copyIssues=[];
 await copyCandidate(candidate,workspace,copyIssues);
 const integrity=[];
 for (const name of ['package.json','tsconfig.json','smoke.mjs']) {
  const expected=await fs.readFile(path.join(fixture,name));
  let actual; try { actual=await fs.readFile(path.join(workspace,name)); } catch { actual=null; }
  integrity.push({file:name,pass:actual !== null && expected.equals(actual)});
 }
 add('protected-fixture-files','integrity',integrity.every(x=>x.pass)&&copyIssues.length===0,{files:integrity,copyIssues});
 // Runtime semantics always use the original package boundary, even if candidate changed it.
 await fs.copyFile(path.join(fixture,'package.json'),path.join(workspace,'package.json'));
 const parsed=ts.parseJsonConfigFileContent(frozenConfig,ts.sys,workspace);
 if (parsed.errors.length) throw new Error(`Frozen compiler configuration invalid: ${ts.formatDiagnostics(parsed.errors,{getCanonicalFileName:x=>x,getCurrentDirectory:()=>workspace,getNewLine:()=> '\n'})}`);
 const options={...parsed.options,rootDir:path.join(workspace,'src'),outDir:path.join(workspace,'dist'),noEmitOnError:true};
 const roots=parsed.fileNames;
 const cleanText=text=>String(text).split(temporary).join('<temporary>');
 const diagnostics=ds=>ds.map(d=>({code:d.code,category:ts.DiagnosticCategory[d.category],file:d.file?path.relative(workspace,d.file.fileName):null,line:d.file&&d.start!==undefined?d.file.getLineAndCharacterOfPosition(d.start).line+1:null,message:cleanText(ts.flattenDiagnosticMessageText(d.messageText,'\n'))}));
 function compile(probe='', overrides=new Map(), emit=false) {
  const probePath=path.join(workspace,'src','__held_out_contract__.ts');
  const host=ts.createCompilerHost(options);
  const originalRead=host.readFile.bind(host);
  const originalExists=host.fileExists.bind(host);
  host.readFile=file=>overrides.has(file)?overrides.get(file):file===probePath&&probe?prelude+probe:originalRead(file);
  host.fileExists=file=>(file===probePath&&!!probe)||overrides.has(file)||originalExists(file);
  const program=ts.createProgram([...roots,...(probe?[probePath]:[])],options,host);
  const ds=ts.getPreEmitDiagnostics(program);
  if (emit && !ds.some(d=>d.category===ts.DiagnosticCategory.Error)) ds.push(...program.emit().diagnostics);
  return {program,ds,pass:!ds.some(d=>d.category===ts.DiagnosticCategory.Error)};
 }
 const baseline=compile('',new Map(),true);
 const client=path.join(workspace,'src','client.ts');
 const hasClient=roots.includes(client);
 add('strict-compilation','type-contract',baseline.pass&&hasClient,{diagnostics:diagnostics(baseline.ds),clientPresent:hasClient});
 for (const [id,probe] of probes) {
  const result=compile(probe);
  add(id,'type-contract',result.pass,{diagnostics:diagnostics(result.ds)});
 }
 // Locate declarations through the export symbol, supporting re-exports and helper modules.
 const checker=baseline.program.getTypeChecker();
 const clientSource=baseline.program.getSourceFile(client);
 function exportedDeclaration(name,predicate) {
  if (!clientSource) return undefined;
  const symbol=checker.getSymbolAtLocation(clientSource);
  let exported=symbol && checker.getExportsOfModule(symbol).find(x=>x.name===name);
  if (exported && exported.flags & ts.SymbolFlags.Alias) exported=checker.getAliasedSymbol(exported);
  return exported?.declarations?.find(predicate);
 }
 const statuses=exportedDeclaration('exampleStatuses',ts.isVariableDeclaration);
 const statusOverrides=new Map();
 if (statuses?.initializer) {
  const source=statuses.getSourceFile();
  statusOverrides.set(source.fileName,source.text.slice(0,statuses.initializer.getStart(source))+'[] as const'+source.text.slice(statuses.initializer.end));
 }
 const statusBaseline=compile(statusProbe);
 const statusMutated=statuses?.initializer?compile(statusProbe,statusOverrides):null;
 add('independent-delivery-status','type-contract',statusBaseline.pass&&!!statusMutated?.pass,{baseline:diagnostics(statusBaseline.ds),sampleMutation:statusMutated?diagnostics(statusMutated.ds):'Could not locate exported exampleStatuses initializer'});
 const event=exportedDeclaration('Event',ts.isTypeAliasDeclaration);
 const formatter=exportedDeclaration('formatEvent',node=>ts.isFunctionDeclaration(node)||ts.isVariableDeclaration(node));
 let exhaustive=false,exhaustiveDetail={baselineClean:baseline.pass};
 if (baseline.pass && event && formatter) {
  const source=event.getSourceFile();
  const insertion=' | { type: "__future_variant__"; id: string; futureValue: boolean }';
  const changed=source.text.slice(0,event.type.end)+insertion+source.text.slice(event.type.end);
  const result=compile('',new Map([[source.fileName,changed]]));
  const formatterSource=formatter.getSourceFile();
  const shift=formatterSource.fileName===source.fileName&&formatter.getStart(formatterSource)>=event.type.end?insertion.length:0;
  const start=formatter.getStart(formatterSource)+shift,end=formatter.end+shift;
  const atHandler=result.ds.filter(d=>d.category===ts.DiagnosticCategory.Error&&d.file?.fileName===formatterSource.fileName&&d.start!==undefined&&d.start>=start&&d.start<end);
  exhaustive=atHandler.length>0;
  exhaustiveDetail={...exhaustiveDetail,diagnostics:diagnostics(result.ds),handlerDiagnostics:diagnostics(atHandler)};
 } else exhaustiveDetail.reason='Requires clean baseline and exported Event type alias plus formatEvent declaration';
 add('future-event-exhaustiveness','type-contract',exhaustive,exhaustiveDetail);
 const explicitAny=[],nonNull=[],suppressions=[],assertions=[];
 for (const source of baseline.program.getSourceFiles()) {
  if (!source.fileName.startsWith(path.join(workspace,'src')+path.sep)) continue;
  const location=node=>({file:path.relative(workspace,source.fileName),line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,text:node.getText(source)});
  function visit(node) {
   if (node.kind===ts.SyntaxKind.AnyKeyword) explicitAny.push(location(node));
   if (ts.isNonNullExpression(node)) nonNull.push(location(node));
   if (ts.isAsExpression(node)||ts.isTypeAssertionExpression(node)) {
    if (!(ts.isTypeReferenceNode(node.type)&&node.type.typeName.getText(source)==='const')) assertions.push(location(node));
   }
   ts.forEachChild(node,visit);
  }
  visit(source);
  const scanner=ts.createScanner(ts.ScriptTarget.Latest,false,source.languageVariant,source.text);
  for(let token=scanner.scan();token!==ts.SyntaxKind.EndOfFileToken;token=scanner.scan()) {
   if ([ts.SyntaxKind.SingleLineCommentTrivia,ts.SyntaxKind.MultiLineCommentTrivia].includes(token)&&/@ts-(?:ignore|expect-error|nocheck)\b/.test(scanner.getTokenText())) {
    suppressions.push({file:path.relative(workspace,source.fileName),line:source.getLineAndCharacterOfPosition(scanner.getTokenPos()).line+1,text:scanner.getTokenText()});
   }
  }
 }
 add('no-explicit-any-or-suppression','safety',!explicitAny.length&&!suppressions.length,{explicitAny,suppressions});
 manualReviewDetails=[...assertions.map(item=>({...item,kind:'type-assertion'})),...nonNull.map(item=>({...item,kind:'non-null-assertion'}))];
 manualReview=manualReviewDetails.length;
 if (baseline.pass&&hasClient) {
  const execution=await runNode(['--input-type=module','-e',runtimeSource,path.join(workspace,'dist','client.js')],workspace);
  const marker='__GRADER_RESULT__';
  const index=execution.stdout.lastIndexOf(marker);
  let results;
  if (index>=0) { try {results=JSON.parse(execution.stdout.slice(index+marker.length).trim());} catch {} }
  if (execution.code===0&&Array.isArray(results)&&results.length===11) {
   for (const result of results) add(result.id,result.category,result.pass,JSON.parse(cleanText(JSON.stringify(result.detail))));
  } else {
   for (const id of ['valid-events','invalid-object-type-id','created-attempt-validation','created-label-validation','retry-and-closed-validation','fresh-filtered-copies','json-validation','formatting','map-fallback','deferred-callbacks','runtime-property-and-preferences']) add(id,'runtime',false,{...execution,stdout:cleanText(execution.stdout),stderr:cleanText(execution.stderr),reason:'Candidate import or execution failed, timed out, or did not produce complete results'});
  }
 } else {
  for (const id of ['valid-events','invalid-object-type-id','created-attempt-validation','created-label-validation','retry-and-closed-validation','fresh-filtered-copies','json-validation','formatting','map-fallback','deferred-callbacks','runtime-property-and-preferences']) add(id,'runtime',false,{reason:'Blocked by candidate compilation failure or missing src/client.ts'});
 }
} catch (error) {
 infrastructureErrors++;
 add('grader-infrastructure','integrity',false,{error:String(error?.stack??error).split(temporary??'\0').join('<temporary>')});
} finally {
 if (temporary) await fs.rm(temporary,{recursive:true,force:true}).catch(()=>{});
 const passed=checks.filter(x=>x.pass).length;
 const failed=checks.length-passed;
 const categories=Object.fromEntries(['runtime','type-contract','safety','integrity'].map(category=>{const subset=checks.filter(check=>check.category===category);return [category,{passed:subset.filter(check=>check.pass).length,failed:subset.filter(check=>!check.pass).length,total:subset.length}];}));
 process.stdout.write(JSON.stringify({summary:{status:infrastructureErrors?'infrastructure-error':failed?'fail':manualReview?'review-required':'pass',passed,failed,total:checks.length,manualReview,infrastructureErrors,categories},checks,compilerVersion,manualReviewDetails},null,2)+'\n');
 process.exitCode=infrastructureErrors?2:0;
}
