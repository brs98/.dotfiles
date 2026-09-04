# interface-extends-over-intersections

**When:** Composing named object shapes with statically known, compatible properties.

```typescript
type User = { id: string; name: string };
interface Admin extends User { permissions: string[] }

// @ts-expect-error An extension cannot replace string with number.
interface InvalidUser extends User { id: number }

type Conflicted = { id: string } & { id: number };
type ConflictedId = Conflicted["id"]; // never
```

Consider `interface extends` for object composition: it checks incompatible inherited properties at declaration time, and TypeScript can cache relationships between interfaces. Official performance guidance distinguishes this from checking intersection constituents and relationships to the intersection as a whole. Intersections are not simply recomputed on every use; measure actual performance concerns.

An interface can extend a suitable object type alias. Keep intersections for intentional compatible refinements and other compositions that interfaces cannot represent, such as unions or conditional generic shapes. Conflicts can produce a `never` property or reduce the whole intersection to `never`, depending on the types.

Overlapping properties must also agree in optionality and readonly modifiers. For example, intersecting `{ readonly x: string }` with `{ x: string }` is legal, but an interface cannot simultaneously extend those two bases. Compile the proposed interface rather than inferring compatibility from property value types alone.

Treat conversion as an intentional contract choice. Interfaces allow declaration merging and can lose the implicit index-signature assignability of object type aliases. Conditional types can consequently change even when both versions compile. Review public consumers and dictionary constraints; compilation alone does not prove equivalence. This distinction is discussed in the [TypeScript issue on implicit index signatures](https://github.com/microsoft/TypeScript/issues/15300).

```typescript
type A = { a: string };
type B = { b: string };
type Combined = A & B;
interface Composed extends A, B {}
type AliasFits = Combined extends Record<string, string> ? true : false;
type InterfaceFits = Composed extends Record<string, string> ? true : false;
const aliasFits: AliasFits = true;
const interfaceFits: InterfaceFits = false;
```

**Sources and version:** [TypeScript documentation](https://github.com/microsoft/TypeScript/wiki/Performance#preferring-interfaces-over-intersections). TypeScript 5.5+, strict mode; examples target ES2022.
