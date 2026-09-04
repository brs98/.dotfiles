# interface-extends-catches-conflicts

**Compatibility reference:** See [interface composition and conflict detection](objects-interface-extends-over-intersections.md) for the canonical guidance and checked examples.

`extends` reports incompatible inherited properties at the declaration. Intersections remain valid for intentional compatible refinements; incompatible combinations can produce `never`.

**Sources and version:** [TypeScript documentation](https://github.com/microsoft/TypeScript/wiki/Performance#preferring-interfaces-over-intersections). TypeScript 5.5+, strict mode; examples target ES2022.
