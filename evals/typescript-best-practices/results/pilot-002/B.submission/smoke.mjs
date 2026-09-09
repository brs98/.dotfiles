import assert from 'node:assert/strict';
import { parseEvent, formatEvent, lookupLabel } from './dist/client.js';

assert.equal(formatEvent(parseEvent({ type: 'created', id: 'a', attempt: 0 })), 'created:a:0');
assert.equal(lookupLabel(new Map([['a', 'Alpha']]), 'a', 'missing'), 'Alpha');
console.log('Smoke checks passed');
