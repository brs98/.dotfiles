# dts-files-for-javascript

**When:** Adding types to existing JavaScript files you can't convert to TypeScript.

## Bad
```javascript
// utils.js
export function add(a, b) { return a + b; }
```
```typescript
import { add } from './utils'; // No types, parameters are 'any'
```

## Good
```javascript
// utils.js (unchanged)
export function add(a, b) { return a + b; }
```
```typescript
// utils.d.ts (same name, .d.ts extension)
export function add(a: number, b: number): number;
```
```typescript
import { add } from './utils'; // Typed! add(number, number) => number
```

## Why
Create a `.d.ts` file with the same name as a `.js` file to provide types without modifying the JavaScript. TypeScript automatically pairs them together.
