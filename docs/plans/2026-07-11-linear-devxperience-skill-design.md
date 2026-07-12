# Linear Devxperience Skill Design

## Goal

Expose full Linear issue management to every local agent harness without MCP,
while making it impossible for the devxperience entrypoint to operate against a
different Linear workspace.

## Architecture

`linear-graphql` owns a dependency-free GraphQL transport. It reads a named
profile, parses one API key from a permission-restricted dotenv file, verifies
the authenticated organization, and only then executes a supplied GraphQL
document. It has no ambient API-key or endpoint fallback.

`linear-devxperience` is the public skill for this workspace. Its launcher pins
the expected organization UUID, URL key, and credential-file location in code
and rejects profile overrides. The API key remains solely in
`~/.config/linear/workspaces/devxperience.env`.

## Interface

The locked launcher accepts a GraphQL file, optional JSON variables or a
variables file, and compact or pretty output. Common issue and comment
operations are bundled as reusable GraphQL documents; arbitrary documents
remain supported for uncommon operations and targeted introspection.

## Failure Behavior

Credential files must be regular, owned by the current user, mode `0600`, and
inside a mode `0700` directory. Dotenv parsing is non-executable and rejects
extra assignments, duplicates, and shell syntax. Every invocation performs a
private workspace identity preflight. A mismatch prevents the user query or
mutation from being sent.

## Verification

Dependency-free Node tests cover dotenv parsing, filesystem security, locked
argument handling, preflight ordering, mismatch blocking, fixed endpoint use,
and credential-free results. A live `whoami` smoke test verifies the configured
profile after the user creates the credential file.
