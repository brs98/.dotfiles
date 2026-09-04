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

**Sources and version:** [TypeScript documentation](https://github.com/microsoft/TypeScript/wiki/Performance#preferring-interfaces-over-intersections). TypeScript 5.5+, strict mode; examples target ES2022.
