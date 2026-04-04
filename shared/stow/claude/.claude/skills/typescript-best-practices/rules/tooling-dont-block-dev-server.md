# dont-block-dev-server

**When:** Configuring type checking with Vite or similar dev servers.

## Bad
```typescript
// vite.config.ts
import checker from 'vite-plugin-checker';

export default {
  plugins: [checker({ typescript: true })]
};
// Type errors block the dev server - can't test runtime behavior
```

## Good
```bash
# Terminal 1: Dev server runs regardless of type errors
npm run dev

# Terminal 2: Type checking in parallel
tsc --watch --noEmit
```

## Why
Don't block the dev server on type errors. You often need to test runtime behavior while fixing types. Run type checking in a separate terminal so errors are visible but not blocking.
