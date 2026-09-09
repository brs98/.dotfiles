# Complete the webhook client

This small client runs on Node 22 as native ESM after TypeScript compilation. Complete and repair `src/client.ts`. You may refactor it, but keep all named exports and existing public contracts compatible. Do not change `package.json`, `tsconfig.json`, or `smoke.mjs`. Add your own tests if helpful. Use the existing compiler; do not install dependencies.

Requirements:

1. `parseEvent(input: unknown)` returns the exported discriminated `Event` union. Input must be a non-null, non-array object. Every event requires a nonempty string `id` (whitespace is allowed). A `created` event requires a finite, nonnegative integer `attempt` and may have `labels`, a dense array containing only strings (sparse holes are invalid). A supplied `labels: undefined` is invalid; absent labels remain absent, and supplied arrays must be copied. A `retry` event requires finite, nonnegative numeric `delayMs` (fractions are allowed). A `closed` event requires `reason` to be a string or null; an absent reason is invalid. Unknown event types and other invalid inputs must throw an `Error`. Return a fresh object containing only recognized fields. Extra input fields are allowed and ignored.
2. `parseEventJson(text: string)` parses JSON and applies the same validation. Malformed JSON must throw an `Error`.
3. `formatEvent(event: Event): string` produces `created:<id>:<attempt>`, `retry:<id>:<delayMs>`, or `closed:<id>:<reason>`. Use `unknown` for a null closed reason, but preserve empty strings. Keep union handling exhaustive so adding a future event variant forces a compiler error at the handling site.
4. `getProperty(value, key)` accepts any key of the supplied object (including symbols and numeric keys), rejects keys absent from that object's static type, and preserves the exact selected property's type. It must accept readonly objects.
5. `lookupLabel(labels, id, fallback)` accepts a readonly map, uses the fallback only when a key is missing, and preserves an existing empty string.
6. `queueLabel(label, enqueue)` does nothing for null. Otherwise enqueue exactly one callback returning the original string, including an empty string, even when the callback runs later.
7. Preserve the existing `defaultPreferences` runtime freeze and values, `StringDictionary`'s string AND number key domain, `Headers`' compatibility with `Record<string, string>`, and `DeliveryStatus`'s independent public `"queued" | "delivered"` contract. `exampleStatuses` is only sample data, not the source of that public contract.

Keep strict checking enabled. Avoid `any`, unchecked type assertions, non-null assertions, and TypeScript error suppressions as workarounds. `as const` and locally justified assertions are acceptable when they represent a checked invariant; explain any assertion you introduce in your final response.

Run `npm run typecheck` and `npm test`. Finish with a concise description of changes, validation, and any remaining limitations. Do not commit your work.
