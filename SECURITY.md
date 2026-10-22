# Security policy

## Supported versions

Svifa 1.x is the supported line. Each release is supported, for every browser that README.md's "Browser support" names, until the
next one is published: a fix, a security fix included, comes in a new version, and the release before it stops receiving fixes
then. When a new major version is released, the last release of the major version before it receives security fixes for six more
months, and its end date is given in the release notes and here.

## Reporting a vulnerability

Report it privately through GitHub: open the [Security tab](https://github.com/arcwrightstudio/svifa/security) and choose
**Report a vulnerability**. Please do not open a public issue.

Describe what an attacker could do and how to reproduce it.

## How a report is handled

1. You get a reply within three days, saying the report has been received.
2. Within 14 days the report is confirmed or declined, with the reasons.
3. A confirmed vulnerability is fixed in a private fork of the repository, with a test that fails without the fix, and released as
   a new version as soon as it is ready.
4. A GitHub security advisory is published with the release, with a CVE where the vulnerability qualifies for one, saying which
   versions are affected and how to update.
5. Reporters are credited in the advisory and the release notes unless they ask not to be. You are kept informed at every step.

## What Svifa does, and what it cannot do

Svifa runs inside the page, with the page's own privileges. Its security requirements are:

- It never sends or fetches anything, and never stores anything: no network requests, cookies or storage.
- It never writes HTML or runs code it is given as text. What it changes is limited to: the scroll position; its own classes on
  the scroller; while a glide is drawn between pixels, the `translate` of the elements listed in `subpixel` and the scroller's
  `overflow-anchor`; while it is stopped, the scroller's `scrollbar-gutter`; in browsers without instant scrolling, the scroller's
  `scroll-behavior`; a `tabindex` on the place a same-page link leads to, for as long as it has the keyboard focus; and, with
  `anchors`, the address of the same page in the browser's history. Each change to the page is put back when Svifa is done with it;
  the history entry stays, as the browser's own entry for that link would.
- It checks every option it is given: a number must be finite and within its range, and an easing a function, or the default is
  used instead.
- It makes each change through the DOM and the CSSOM, so it works under a strict Content Security Policy with Trusted Types
  required, which the tests prove in all three engines.
- With `anchors`, it acts only on links to the same page (the same origin, path and query) and only scrolls to the element the
  link names.

What it cannot do: protect a page from the page's own scripts. Anything running in the page can call Svifa, or do what Svifa does,
directly. A copy loaded from a CDN is only as trustworthy as its delivery, which is why the README pins each file to its version
and its integrity hash.

## Verifying a release

Every version on npm is built and published by this repository's Release workflow and carries a signed provenance statement:
npm shows it on the package page, linked to the exact commit and workflow run. To verify the copy you installed:

```sh
npm audit signatures
```

It checks the registry signature and the provenance of every installed package, Svifa included. The provenance is signed with a
short-lived certificate that Sigstore issues to the workflow itself through GitHub's OpenID Connect, and is recorded in Sigstore's
public transparency log; no long-lived private key signs the package, on npm or anywhere else. For a copy loaded from a CDN, the README's
`integrity` hashes are the published files' own, and the browser refuses any file that differs.

The provenance also says who built the release. On the version's page on npmjs.com, under Provenance, check that the source commit
is in `github.com/arcwrightstudio/svifa`, that it is the commit the release's tag (`v1.0.0` for 1.0.0) points to, and that the
build file is `.github/workflows/release.yml`. A version built anywhere else, or by any other workflow, is not one of Svifa's.

From 1.2.0, each release tag is signed with Svifa's release key, and GitHub marks it Verified. To check a tag yourself, with the
key's fingerprint `SHA256:q+LwnztDgZLEWmfaLkj2eAexdnDOADk08f2OUHG/egI`:

```sh
echo '*@arcwright.studio ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAII/WllngUwt1UeMhdPZpD2XLlEIM2F60abpiKbJ0KcZH' > allowed_signers
git -c gpg.ssh.allowedSignersFile=allowed_signers verify-tag v1.2.0
```

Earlier tags are not signed; each one's signed provenance names the commit it points to.

Each package also carries its software bill of materials, `dist/sbom.cdx.json` (CycloneDX, written by `npm sbom`), which names
the version and its license and lists its components: none, since Svifa has no runtime dependencies.

## Dependencies

Svifa's released files contain no third-party code. Development tools are added only when a task needs one, chosen for being
maintained and widely used, installed at the exact versions and integrity hashes in `package-lock.json` (`npm ci`), and kept
current by Dependabot, which proposes a new version only once it has been public for a week, the time in which a malicious release
is usually found and taken down. Thresholds for what the checks find:

- Every pull request is checked by dependency review against the GitHub Advisory Database, and cannot be merged while it adds a
  dependency with a known vulnerability of any severity or a license outside those that allow open use.
- A Dependabot security alert is fixed within 14 days when it is critical or high, and within 30 days otherwise.
- No release is made while any installed package has a known vulnerability: the Release workflow runs `npm audit` and stops at
  any finding.
- A vulnerability in a component that does not affect Svifa is answered with a VEX statement (OpenVEX), published with the
  advisory or the release notes, saying why it cannot be exploited through Svifa.

A development tool that no longer has releases stays only when a task cannot be done without it, and only once its code has been
read. Two are installed today, both by the frameworks Svifa's components are tested with, and both only for building and testing:
`estree-walker` 2 (by Vue's compiler), which walks a syntax tree and has no dependencies, and `is-reference` 3 (by Svelte's
compiler), one short function that tells whether a node in a syntax tree names a variable, with only type definitions as a
dependency. Neither reads files, the network or the environment. Each is read again whenever the framework that installs it moves
to another version of it.

## Static analysis

CodeQL, with its extended security queries, analyses the source, the tests, the scripts, the examples and the workflows on every
pull request, on every push to `main` and once a week (`.github/workflows/codeql.yml`). A pull request with an alert
of high or critical security severity, or any error, cannot be merged. Any other alert is fixed, or dismissed with a written
reason, before the next release.

## Secrets and credentials

The project keeps no long-lived secret: the Release workflow signs in to npm through OpenID Connect, and no token is stored in the
repository, its settings or its workflows. Secret scanning and push protection refuse a credential pushed to the repository. The
accounts that can change the repository or publish to npm use two-factor authentication. A token a maintainer uses for the
project is scoped to what it is for and kept in the operating system's credential store, never in a file in a checkout. Tokens
are replaced at least once a year, and at once if one may have been exposed, in which case it is revoked before anything else is
done.

## Assurance case

Why the requirements above hold.

**Threat model.** Three things could reach Svifa:

- A visitor, or a link someone sends them: wheel, key, touch and pointer events, and the fragment of the address. Svifa reads only
  how far and which way an event moves, which key it is, and, for a fragment, the id it names.
- The page's own code, which is trusted by the page: Svifa gives it no capability it did not already have.
- The delivery of Svifa itself: a changed package on npm, a changed file on a CDN, or a compromised build.

**Trust boundaries.** Input events and the address fragment, where they enter Svifa's handlers; the npm registry and the CDNs,
where Svifa's files enter a page; and the build and release workflow, where the files are made.

**Secure design principles applied.**

- Economy of mechanism: one small module with no runtime dependencies.
- Fail-safe defaults: everything that changes the page beyond the wheel (`anchors`, `subpixel`, `snap`) is off until asked for, and
  what Svifa cannot do safely in a browser (no `translate`, a scroller that snaps without `snap`, reduced motion) is left to the
  browser.
- Complete mediation: every event is checked every time (modifier keys, an event already handled, an editable field, a scrolling
  box inside) before Svifa acts on it.
- Least privilege: the library needs no permission of any kind; the workflows run with read-only tokens, only the publishing job
  can request an OpenID Connect token, and every action they use is pinned to a commit.
- Open design: the source, the tests and the release process are public, and nothing depends on secrecy.
- Psychological acceptability: the keyboard, the scroll bar, touch and find in page stay the browser's own, and the reader's
  reduced-motion setting is followed.

**Common weaknesses countered.**

- Cross-site scripting (CWE-79): Svifa never writes HTML and never turns a string into code; a selector or an id is only looked up
  with `querySelector` or `getElementById`.
- Open redirect (CWE-601): a link is acted on only when it leads to the same page, and only that same address goes into history.
- Improper input validation (CWE-20): the inputs from outside the page (events and the address fragment) are read only for the
  values listed above, and every number given as an option is checked for being finite and within its range, the default replacing
  one that is not.
- Prototype pollution (CWE-1321): options are read one known name at a time; no object from outside is merged into another.
- Inefficient regular expressions (CWE-1333): the only regular expression is a fixed, linear one, run against an element's tag name.
- Uncontrolled resource consumption (CWE-400): the frame loop runs only while something moves, every glide ends, and nothing grows
  without bound.
- Inclusion of functionality without integrity checks (CWE-494, CWE-829): no runtime dependencies; signed provenance on npm;
  integrity hashes for CDN use; dependencies watched by Dependabot, which proposes a new release only once it is a week old.

**Verification.** CodeQL with its extended security queries runs on every change, and a change with a high-severity finding cannot
be merged; secret scanning blocks a pushed credential; the tests run in Chromium, Firefox and WebKit on every change, among them
property tests that feed Svifa generated input, options of kinds its types do not allow included, with new cases on every run.

## Security review

The latest review was on 21 October 2026, of version 1.0.0 and the changes since it (scrolling both ways). It checked the code and
the release path against the requirements and the trust boundaries above:

- Every write to the page: the `translate` of the `subpixel` elements, the scroller's `overflow-anchor`, `scrollbar-gutter` and
  `scroll-behavior`, its classes, and a `tabindex` while the place a link leads to has the focus. Each value written is a number
  Svifa works out, a fixed word, or the value that was there before.
- Every input from outside the page's code: wheel, key, touch and pointer events, read only for how far, which way and which key;
  and a same-page link, whose address is parsed with `URL`, compared with the page's own origin, path and query, decoded with a
  malformed escape taken as written, and looked up only with `getElementById`.
- Every selector a page passes (`scrollTo`, `subpixel`): looked up only with `querySelector`, `querySelectorAll` or
  `getElementById`, and one the browser cannot read finds nothing rather than throwing.
- The options: each is read by its known name and checked; nothing from outside is merged into another object, and no string
  becomes code.
- The workflows: read-only tokens by default, an OpenID Connect token only for the job that stages a release, no credentials kept
  in a checkout, and every action pinned to a commit.
- The package: no runtime dependencies and no install scripts, and its files are exactly what the build makes from the release's
  tag, which CI checks by building the newest release again and comparing it with npm's copy byte for byte.

Nothing needed a fix. The review is repeated for every minor version, and at least once a year.
