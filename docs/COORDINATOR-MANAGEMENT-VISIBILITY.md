# Coordinator management visibility correction

## Demonstrated problems

The existing-account form reported every persisted assignment as an existing role without showing its status or offering a direct route into its editor. The permission editor required a second account selection and hid each permission category in a closed disclosure. Public leadership controls were also collapsed. This made an existing zero-permission assignment appear impossible to manage.

## Acceptance criteria

- Saved assignments are visible on the Roles & Permissions tab with sport, status, and permission count.
- Existing-account selection offers a direct Manage action for the exact account and sport, without changing assignment state.
- Every permission category opens by default after selecting an account. New assignments show disabled, unchecked options until the zero-permission role has been saved.
- Individual permission changes require explicit save and confirmation; opening or navigating never grants access.
- Public leadership controls open by default and explain the saved visibility state and coaches-page publication steps. Public publication remains independent of access, as required by master directive phases 6 and 16.
- Suspended/removed records are not represented as active roles and cannot be reset through the invitation shortcut.
- Clearing account selection closes the previous editor.

## Validation

Rendered component regression covers the invitation-to-editor flow, visible categories, one-permission save, independent public-title save, clearing selection, and disabled zero-default new-role controls. Existing security regression verifies public leadership display and permission independence. No schema, dependency, account-specific rule, production assignment, or permission migration is introduced. Production publication details belong in the PR release receipt.
