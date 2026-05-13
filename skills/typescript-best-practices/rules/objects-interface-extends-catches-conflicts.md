# interface-extends-catches-conflicts

**When:** Merging object types that might have incompatible property types.

## Bad
```typescript
type A = { id: string };
type B = { id: number };
type C = A & B; // C["id"] is string & number = never (silent failure)
```

## Good
```typescript
interface A { id: string }
interface B extends A { id: number } // Error: Types incompatible
```

## Why
Interface extends surfaces property conflicts at declaration time with clear errors. Intersections silently create `never` for conflicting properties, causing confusing errors later.
