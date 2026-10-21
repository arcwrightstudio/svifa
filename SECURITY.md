# Security policy

## Supported versions

Security fixes are released for the latest version of Svifa.

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
- It checks every number it is given: a number must be finite and within its range, or the default is used instead.
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
public transparency log; no long-lived private key exists, on npm or anywhere else. For a copy loaded from a CDN, the README's
`integrity` hashes are the published files' own, and the browser refuses any file that differs.

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
- Fail-safe defaults: everything that changes the page beyond the wheel (`anchors`, `subpixel`) is off until asked for, and what
  Svifa cannot do safely in a browser (no `translate`, a scroller that snaps, reduced motion) is left to the browser.
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
