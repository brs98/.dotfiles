# union-for-shared-properties

**When:** A function accepts domain variants and uses properties guaranteed on each variant.

```typescript
type User = { id: string; name: string };
type Product = { id: string; price: number };
function getId(item: User | Product) {
  return item.id;
}
function label(item: User | Product) {
  if ("name" in item) return item.name;
  return String(item.price);
}
```

Before narrowing, a union permits property access only when every member supplies that property. Discriminants or checks such as `in` enable variant-specific access. If a reusable helper only needs `id`, accepting `{ id: string }` may express its contract more directly without coupling it to every domain variant.

**Sources and version:** [TypeScript documentation](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#union-types). TypeScript 5.5+, strict mode; examples target ES2022.
