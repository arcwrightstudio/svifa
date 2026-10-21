# Governance

Svifa is maintained by Arcwright Studio, which owns the repository and the npm package and makes the final decisions about what
goes into Svifa, how it is designed, and when it is released.

## Roles

- **Maintainer**: Arcwright Studio ([@arcwrightstudio](https://github.com/arcwrightstudio)). Reviews and merges pull requests,
  triages issues and answers discussions, handles security reports as [SECURITY.md](./SECURITY.md) describes, keeps the
  dependencies and the workflows current, and releases new versions, approving each one on npm before it is published.
- **Code owners**: the accounts in [`.github/CODEOWNERS`](./.github/CODEOWNERS). Every change needs a code owner's approval
  before it merges, as [CONTRIBUTING.md](./CONTRIBUTING.md#how-a-change-is-reviewed) describes.
- **Contributors**: anyone who opens an issue, a discussion or a pull request, following [CONTRIBUTING.md](./CONTRIBUTING.md) and
  the [code of conduct](./CODE_OF_CONDUCT.md).

## Access

Who can reach Svifa's sensitive resources:

- The repository's settings, its security reports and its releases: the maintainer,
  [@arcwrightstudio](https://github.com/arcwrightstudio), the repository's only admin.
- Changes to the repository, each through a pull request: the code owners, the accounts listed in
  [`.github/CODEOWNERS`](./.github/CODEOWNERS), and no one else.
- The npm package: its owners on npm, who approve each version the Release workflow stages. Nothing is published to npm by hand.

Access beyond reading (the right to push, to own code, to publish) is given only by the maintainer, after reviewing the person's
contributions so far and confirming that their accounts use two-factor authentication, and only as far as their work needs. It is
reviewed whenever someone's role changes and at least once a year, and taken back when it is no longer needed.

## How decisions are made

A proposal starts as an issue or a discussion. The maintainer decides, and explains the decision in the issue or discussion where
it was made. A change lands only through a pull request that passes every check. Svifa's direction is in the README's roadmap.

## Continuity

The repository, the npm package and the release process belong to Arcwright Studio rather than to any one person. More than one
person at the studio can reach the accounts and credentials needed to answer issues, accept changes and publish a release, so
Svifa can carry on within a week if any one of them cannot.
