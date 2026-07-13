# Fluid Commerce Linear Workspace Lock

## Goal

Provide general Linear issue operations for Fluid Commerce without allowing an agent to select or inherit the wrong Linear workspace.

## Design

Add a `linear-fluid-commerce` skill as a thin workspace-specific layer over the existing workspace-neutral `linear-graphql` transport and operation catalog.

The launcher will hard-code both immutable Fluid Commerce organization identifiers:

- Organization ID: `54014601-3568-41d9-bc77-384a8559283d`
- URL key: `fluid-commerce`

It will also hard-code `~/.config/linear/workspaces/fluid-commerce.env` as its credential source, reject `--profile`, ignore ambient API keys, and force workspace metadata into every response. Before each requested operation, the shared transport will query `viewer.organization` using the same credential and block the operation unless both identifiers match.

Shared GraphQL documents remain in `linear-graphql/operations/`; the Fluid Commerce skill adds no duplicate operations.

## Failure behavior

- A devxperience or other workspace credential in the Fluid Commerce credential file fails before the requested query or mutation runs.
- A caller cannot override the workspace profile from the command line.
- Missing, symlinked, incorrectly owned, or incorrectly permissioned credentials fail closed.
- Mutations must be announced before execution and verified from the returned Fluid Commerce workspace envelope.

## Verification

- Unit-test the pinned Fluid Commerce profile.
- Test the actual launcher ignores a conflicting ambient key, forces the Fluid Commerce envelope, and rejects a devxperience file credential before the user operation.
- Test the launcher rejects `--profile` and omits it from help.
- Run the shared transport test suite.
- Run a live `whoami` operation through the locked launcher and verify the returned organization ID and URL key.
- Run agent scenarios with the completed skill and confirm they choose only the locked launcher for Fluid Commerce work.
