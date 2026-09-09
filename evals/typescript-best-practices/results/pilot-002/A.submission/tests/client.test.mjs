import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseEvent, parseEventJson, formatEvent, getProperty, lookupLabel,
  queueLabel, defaultPreferences, exampleStatuses,
} from '../dist/client.js';

test('valid events are fresh, contain recognized fields, and format correctly', () => {
  for (const [input, expected] of [
    [{ type: 'created', id: ' ', attempt: 0 }, 'created: :0'],
    [{ type: 'retry', id: 'r', delayMs: 0.5 }, 'retry:r:0.5'],
    [{ type: 'retry', id: 'r', delayMs: 0 }, 'retry:r:0'],
    [{ type: 'closed', id: 'c', reason: null }, 'closed:c:unknown'],
    [{ type: 'closed', id: 'c', reason: '' }, 'closed:c:'],
    [{ type: 'closed', id: 'c', reason: 'done' }, 'closed:c:done'],
  ]) {
    const event = parseEvent({ ...input, extra: true });
    assert.deepEqual(event, input);
    assert.notEqual(parseEvent(input), input);
    assert.equal(formatEvent(event), expected);
    assert.deepEqual(parseEventJson(JSON.stringify(input)), input);
  }
});

test('labels remain absent or are copied, including empty arrays and strings', () => {
  const base = { type: 'created', id: 'a', attempt: 1 };
  assert.equal(Object.hasOwn(parseEvent(base), 'labels'), false);
  for (const labels of [[], [''], ['one', 'two']]) {
    const event = parseEvent({ ...base, labels });
    assert.deepEqual(event.labels, labels);
    assert.notEqual(event.labels, labels);
    labels.push('later');
    assert.notDeepEqual(event.labels, labels);
  }
  assert.deepEqual(parseEvent({ ...base, labels: Object.freeze(['frozen']) }).labels, ['frozen']);
});

test('invalid events and JSON throw Errors', () => {
  const created = { type: 'created', id: 'a', attempt: 0 };
  const invalid = [
    null, undefined, [], 'event', 1, true, () => {}, {},
    { ...created, type: 'unknown' },
    ...['', null, undefined, 0].map(id => ({ ...created, id })),
    { type: 'created', attempt: 0 }, { type: 'created', id: 'a' },
    { id: 'a', attempt: 0 },
    ...[-1, 0.5, NaN, Infinity, -Infinity, '0', null, undefined].map(attempt => ({ ...created, attempt })),
    ...[undefined, null, 'label', [1], ['ok', undefined], new Array(1), ['a', , 'c']].map(labels => ({ ...created, labels })),
    { type: 'retry', id: 'r' },
    ...[-1, NaN, Infinity, -Infinity, '1', null, undefined].map(delayMs => ({ type: 'retry', id: 'r', delayMs })),
    { type: 'closed', id: 'c' },
    ...[undefined, 0, false, {}].map(reason => ({ type: 'closed', id: 'c', reason })),
  ];
  for (const input of invalid) assert.throws(() => parseEvent(input), Error);
  for (const text of ['{', '', 'undefined', 'null', '[]', '{}', '{"type":"closed","id":"c"}']) {
    assert.throws(() => parseEventJson(text), Error);
  }
});

test('inherited array indices do not fill sparse holes', () => {
  const labels = new Array(1);
  const prototype = Object.create(Array.prototype);
  prototype[0] = 'inherited';
  Object.setPrototypeOf(labels, prototype);
  assert.throws(() => parseEvent({ type: 'created', id: 'a', attempt: 0, labels }), Error);
});

test('property selection supports readonly, numeric, and symbol keys', () => {
  const symbol = Symbol('key');
  const value = Object.freeze({ name: '', 2: 42, [symbol]: true });
  assert.equal(getProperty(value, 'name'), '');
  assert.equal(getProperty(value, 2), 42);
  assert.equal(getProperty(value, symbol), true);
});

test('label lookup preserves empty strings and falls back for missing keys', () => {
  const labels = new Map([['empty', ''], ['present', 'label']]);
  assert.equal(lookupLabel(labels, 'empty', 'fallback'), '');
  assert.equal(lookupLabel(labels, 'present', 'fallback'), 'label');
  assert.equal(lookupLabel(labels, 'missing', 'fallback'), 'fallback');
});

test('queued labels retain their original values when invoked later', () => {
  const callbacks = [];
  const enqueue = callback => callbacks.push(callback);
  queueLabel(null, enqueue);
  assert.equal(callbacks.length, 0);
  queueLabel('', enqueue);
  queueLabel('original', enqueue);
  assert.equal(callbacks.length, 2);
  assert.deepEqual(callbacks.map(callback => callback()), ['', 'original']);
});

test('public runtime constants retain their values and freeze', () => {
  assert.deepEqual(defaultPreferences, { theme: 'system', retries: 3 });
  assert.equal(Object.isFrozen(defaultPreferences), true);
  assert.deepEqual(exampleStatuses, ['queued']);
});
