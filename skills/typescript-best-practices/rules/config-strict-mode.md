# strict-mode

**When:** Starting any new TypeScript project.

## Bad
```json
{
  "compilerOptions": {
    "strictNullChecks": true,
    "strictFunctionTypes": true
  }
}
```

## Good
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true
  }
}
```

## Why
`strict: true` enables all strict type-checking options as a bundle. Adding individual strict flags is error-prone and may miss new options. `noUncheckedIndexedAccess` and `noImplicitOverride` add extra safety not included in strict.
