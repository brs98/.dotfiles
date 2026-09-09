import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultPreferences, formatEvent, getProperty, lookupLabel,
  parseEvent, parseEventJson, queueLabel,
} from '../dist/client.js';

test('valid events are projected into fresh objects and format correctly', () => {
  const cases = [
    [{ type: 'created', id: ' ', attempt: 0 }, 'created: :0'],
    [{ type: 'created', id: 'a', attempt: 2, labels: ['', 'tag'] }, 'created:a:2'],
    [{ type: 'created', id: 'a', attempt: 0, labels: [] }, 'created:a:0'],
    [{ type: 'retry', id: 'a', delayMs: 0 }, 'retry:a:0'],
    [{ type: 'retry', id: 'a', delayMs: 0.5 }, 'retry:a:0.5'],
    [{ type: 'closed', id: 'a', reason: null }, 'closed:a:unknown'],
    [{ type: 'closed', id: 'a', reason: '' }, 'closed:a:'],
    [{ type: 'closed', id: 'a', reason: 'done' }, 'closed:a:done'],
  ];
  for (const [expected, formatted] of cases) {
    const input = { ...expected, extra: true };
    const actual = parseEvent(input);
    assert.deepEqual(actual, expected);
    assert.notEqual(actual, input);
    assert.equal(formatEvent(actual), formatted);
    assert.deepEqual(parseEventJson(JSON.stringify(input)), expected);
  }
  assert.equal(Object.hasOwn(parseEvent({ type: 'created', id: 'a', attempt: 0 }), 'labels'), false);
});

test('labels are copied and reject sparse arrays, even with inherited entries', () => {
  const labels = ['original'];
  const event = parseEvent({ type: 'created', id: 'a', attempt: 0, labels });
  assert.notEqual(event.labels, labels);
  labels[0] = 'changed';
  assert.deepEqual(event.labels, ['original']);
  const inherited = new Array(1);
  Object.setPrototypeOf(inherited, { 0: 'inherited' });
  for (const invalid of [new Array(1), ['a', , 'b'], inherited]) {
    assert.throws(() => parseEvent({ type: 'created', id: 'a', attempt: 0, labels: invalid }), Error);
  }
});

test('invalid input and required fields throw Errors', () => {
  const invalid = [null, undefined, [], 1, true, 'event', () => {}, {},
    { type: 'other', id: 'a' }, { type: 1, id: 'a' }];
  for (const base of [
    { type: 'created', id: 'a', attempt: 0 },
    { type: 'retry', id: 'a', delayMs: 0 },
    { type: 'closed', id: 'a', reason: null },
  ]) {
    const { id, ...missingId } = base;
    invalid.push(missingId);
    for (const badId of ['', undefined, null, 0, false, {}]) invalid.push({ ...base, id: badId });
  }
  invalid.push({ type: 'created', id: 'a' }, { type: 'retry', id: 'a' }, { type: 'closed', id: 'a' });
  for (const attempt of [undefined, null, '0', false, -1, 0.5, NaN, Infinity, -Infinity]) {
    invalid.push({ type: 'created', id: 'a', attempt });
  }
  for (const delayMs of [undefined, null, '0', false, -1, NaN, Infinity, -Infinity]) {
    invalid.push({ type: 'retry', id: 'a', delayMs });
  }
  for (const reason of [undefined, 0, false, {}, []]) invalid.push({ type: 'closed', id: 'a', reason });
  for (const labels of [undefined, null, 'tag', {}, [1], ['ok', undefined], [null]]) {
    invalid.push({ type: 'created', id: 'a', attempt: 0, labels });
  }
  for (const input of invalid) assert.throws(() => parseEvent(input), Error);
});

test('JSON syntax and semantic validation both reject invalid events', () => {
  for (const text of ['{', '', 'undefined', 'null', '[]', '{}',
    '{"type":"created","id":"a","attempt":1.5}',
    '{"type":"retry","id":"a","delayMs":1e400}',
    '{"type":"closed","id":"a"}',
    '{"type":"created","id":"a","attempt":0,"labels":[null]}']) {
    assert.throws(() => parseEventJson(text), Error);
  }
});

test('properties and maps preserve selected values, including empty strings', () => {
  const symbol = Symbol('key');
  const value = Object.freeze({ name: '', 0: 42, [symbol]: true });
  assert.equal(getProperty(value, 'name'), '');
  assert.equal(getProperty(value, 0), 42);
  assert.equal(getProperty(value, symbol), true);
  const labels = new Map([['empty', ''], ['present', 'label']]);
  assert.equal(lookupLabel(labels, 'empty', 'fallback'), '');
  assert.equal(lookupLabel(labels, 'present', 'fallback'), 'label');
  assert.equal(lookupLabel(labels, 'missing', 'fallback'), 'fallback');
});

test('queued callbacks retain each original string when invoked later', () => {
  const callbacks = [];
  const enqueue = callback => callbacks.push(callback);
  queueLabel(null, enqueue);
  assert.equal(callbacks.length, 0);
  queueLabel('', enqueue);
  queueLabel('label', enqueue);
  assert.equal(callbacks.length, 2);
  assert.deepEqual(callbacks.map(callback => callback()), ['', 'label']);
});

test('default preferences keep their values and runtime freeze', () => {
  assert.deepEqual(defaultPreferences, { theme: 'system', retries: 3 });
  assert.equal(Object.isFrozen(defaultPreferences), true);
  assert.throws(() => { defaultPreferences.retries = 4; }, TypeError);
});
