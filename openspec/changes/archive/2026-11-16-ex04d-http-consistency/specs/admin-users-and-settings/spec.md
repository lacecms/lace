## ADDED Requirements

### Requirement: Users and invitations can be paged independently
The Users screen SHALL load the first user and invitation pages independently
and offer a separate accessible Load more action for each list with a
continuation. The user summary SHALL use server totals for all accounts and
all disabled accounts. The existing row affordances, confirmation and
session recovery SHALL apply across all loaded pages. After a successful
change the screen SHALL refresh the affected list and its totals from the
server, including when the changed record was on a subsequent page.

#### Scenario: A disabled account is on a later page
- **WHEN** the first user page contains enabled accounts only, and the server
  reports an additional disabled account on a later page
- **THEN** the summary includes the disabled account immediately, and loading
  the next user page makes its row available without advancing invitations

#### Scenario: An invitation is revoked from a later page
- **WHEN** the administrator revokes an invitation reached through Load more
  and the server confirms the change
- **THEN** the invitation is absent from the refreshed list and the
  invitation paging state can continue from that refreshed result
