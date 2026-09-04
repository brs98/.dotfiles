# Use semantic extraction as a refactoring aid

**When:** Extracting a selected expression or statements into a constant or function while preserving the intended evaluation behavior.

```typescript
const items = [{ active: true, name: "Ada" }];
const names = items.filter((item) => item.active).map((item) => item.name);
```

Select the expression and use the editor/LSP's **Extract to constant** or **Extract to function** action. VS Code commonly exposes these through the lightbulb/Quick Fix menu; shortcuts vary by platform/keymap.

Review scope, captured variables, evaluation order and public API changes in the proposed diff. Automated extraction is helpful, not a guarantee that every offered scope preserves the behavior you intend. Select an expression for expression extraction and statements for function extraction, then run the relevant checks.

**Validation:** Compiler examples checked with TypeScript 5.9.2; strict checking unless stated otherwise.

**Source:** [VS Code TypeScript refactoring](https://code.visualstudio.com/docs/typescript/typescript-refactoring)
