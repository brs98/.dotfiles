# type-predicates

**Compatibility reference:** The canonical lesson is [type predicates](narrowing-type-predicates.md).

TypeScript 5.5 can infer predicates for eligible checks such as an unannotated `value => typeof value === "string"`. An explicit `boolean` return annotation prevents that inference. Use the canonical lesson for inference conditions and the obligations of explicit predicate contracts.

**Sources and version:** [TypeScript documentation](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-5.html#inferred-type-predicates). TypeScript 5.5+, strict mode; examples target ES2022.
