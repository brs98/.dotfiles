# Linear Custom View Operations

## Goal

Stop agents from repeatedly authoring GraphQL for routine Linear custom-view work by extending the shared operation catalog used by every workspace-locked launcher.

## Scope

Add seven variable-driven GraphQL documents:

- List custom views with cursor pagination and filtering.
- Get one custom view by ID or slug.
- Create, update, and delete a custom view.
- Fetch the issues produced by an issue custom view.
- Check whether a custom view has subscribers before deletion.

View-preference mutations and project, initiative, or feed result queries remain out of scope until repeated use demonstrates a need.

## Interface

The documents live in `skills/linear-graphql/operations/` and run through either workspace-locked launcher. Read operations return current `CustomView` fields, including `filterData`; they must not request the deprecated `filters` field. Lists and issue results expose `pageInfo`. Mutations accept typed input entirely through GraphQL variables and return the affected view or deletion identifier.

The workspace references will show commands for the new operations. Existing mutation rules still apply: announce the intended change, verify the workspace envelope, and report returned identifiers and URLs where available.

## Safety and errors

Deletion is a separate operation and should normally follow the subscriber check. The operation itself remains intentionally direct so callers can make an explicit user-approved deletion. Inputs are never interpolated into GraphQL source. Custom filter JSON is supplied through typed `CustomViewCreateInput` or `CustomViewUpdateInput` variables.

## Verification

Add an operation-catalog test that initially fails because the seven documents do not exist, then verifies operation names, typed variables, pagination fields, current filter fields, and the subscriber-before-delete companion. Run the existing transport/security tests and validate the documents against the live, workspace-verified Linear schema without performing mutations.
