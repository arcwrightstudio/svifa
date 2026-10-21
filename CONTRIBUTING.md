# Contributing to Svifa

Thank you for helping. Bug reports, fixes and improvements to the docs are all welcome.

## Reporting a bug

Open an issue with the bug form. The most useful report links to a page that shows the problem: open one of the
[examples](./examples) on StackBlitz, change it until the problem shows, and paste the link. Say which browser and system you saw it
in, and your display's refresh rate and scaling, since smooth scrolling depends on both.

For a question, or to share a site that uses Svifa, start a [discussion](https://github.com/arcwrightstudio/svifa/discussions) instead.

## Changing the code

Development needs Node 22.18, 24.11, 26 or later.

```sh
npm ci                   # the tools (and npx playwright install, once, for the browsers)
npm run lint             # oxlint for defects, and Prettier for the code style (npm run format applies it)
npm run typecheck        # the library, then the tests and the config files
npm run build            # dist/: the ES module, the CommonJS file, the script builds, the React entry and the types
npm test                 # the suite in Chromium, Firefox and WebKit, about a minute
npm run coverage         # how much of src/ the tests run, file by file; fails below the floors in scripts/coverage.mjs
npm run check:package    # the exports and types as every module resolution reads them, and the CDN tags' pinned hashes
npm run check:installs   # installs the packed package with npm, pnpm, Yarn 1 and 4 (Plug'n'Play), Bun and Deno; fails on warnings
```

`SVIFA_REACT_DIR=<a node_modules folder with another React> npx playwright test tests/react.spec.ts` runs the React entry's tests
against another React version (React 18 is supported as well as 19).

### How it works

Svifa is one object per scroller. Its input handlers (the wheel, keys, touch, same-page links) turn what the reader does into a
place to go, or step aside for the browser. A frame loop, running only while something moves, carries the position toward that
place by the time since the last frame. Each move is written on the browser's own pixel grid, and the part of a pixel left over is
drawn on the chosen elements. Anything else that moves the scroller (a key, the scroll bar, a script) takes over at once. The files:

- `src/svifa.ts`: the `Svifa` class: options, input (wheel, keys, touch, anchors), the frame loop, the motion (a damped approach by
  `lerp`, or a timed curve), what it reports (`scroll` events, one `scrollend` per glide, classes).
- `src/scroller.ts`: the page or a scrolling element along one axis: reading and writing its position on the browser's pixel grid
  (device pixels, or whole CSS pixels in browsers that keep those, learned from the first move), its end, snapping, overflow.
- `src/subpixel.ts`: draws the part of a pixel the browser cannot scroll by as a `translate` on the chosen elements, holding sticky
  elements still while they are held.
- `src/target.ts`: what a `scrollTo` target names and the position it stands for (scroll-margin, scroll-padding, nested boxes).
- `src/wheel.ts`: a wheel event in pixels, and whether an element inside the scroller takes it itself.
- `src/types.ts`: the public types; their JSDoc is the reference editors show. `src/react.ts`: the React entry (`SmoothScroll`,
  `useSvifa`), which imports the core by the package's own name (`tsconfig.json` maps it to `src/index.ts`).
- `tests/`: one spec per area. `tests/setup.ts` loads the script build and steps Svifa frame by frame on a clock of the test's own
  (`autoRaf: false`), so every run sees the same frames at any chosen refresh rate. A test for something only some engines have is
  tagged (`@chromium-only`, `@not-webkit`) or listed in `playwright.config.ts`, so it runs only there and nothing is reported
  skipped.
- `tests/properties.spec.ts`: what must hold for every input, checked on many generated cases by
  [fast-check](https://fast-check.dev), new ones on every run: wheel turns, glides and frame timings of every size, and options of
  kinds the types do not allow. A failure prints the seed and path that replay it.

### Code style

TypeScript and JavaScript are formatted by [Prettier](https://prettier.io) with the settings in `.prettierrc.json`: no
semicolons, single quotes, lines of up to 132 characters. [oxlint](https://oxc.rs/docs/guide/usage/linter.html) checks the code for
defects with its correctness and suspicious rules, as `.oxlintrc.json` sets them (the tests may reuse a name inside the page they
drive, and call a constructor for what it does). `npm run lint` checks both, and CI runs it on every change. An exception to a
rule is rare, and is written where it applies, with the reason beside it.

Every source file opens with two lines: the license as an [SPDX](https://spdx.dev/learn/handling-license-info/) identifier, and
the copyright that `LICENSE` gives. CSS and HTML files write them in their own comments. A new file starts with them too, and CI
checks every file for them.

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio
```

### Rules every change follows

- A fix comes with a test that fails without it. Write the test first, see it fail against the old code, then fix, and put the fault
  back once more to see the test catch it.
- A new feature or option comes with tests for what it does, in every engine it runs in, and for what it must leave alone.
- Motion is judged in time, never in frames: every rule gives the same result at any refresh rate, from 60 to 1000 Hz
  (`w.frame(g, hz)`). A test on the browser's own frames waits for what it checks, never for a number of frames.
- Positions read back from the browser carry rounding (a float32 in Chromium); compare with the slop `scroller.ts` uses, not `===`.
- A scroll Svifa did not make (a key, the scroll bar, a script, the browser) always wins over a glide under way.
- No dependencies. Anything a browser from the last few years lacks is detected and left to the browser, never polyfilled.
- Every exported function, method and accessor states its types (`isolatedDeclarations`): the declarations are written from the
  source alone, so the published types are exactly what the code says.
- esbuild runs an install script, approved by version in `allowScripts` in `package.json`. After updating esbuild, approve it again
  with `npm install-scripts approve esbuild`.
- The JSDoc in `src/`, `README.md` and `llms.txt` describe the same API and change with the code. A statement in any of them is
  something a test or a measurement shows.

### Signing off

Every commit carries a `Signed-off-by:` line with its author's name and email, which `git commit -s` adds. It certifies the
[Developer Certificate of Origin](https://developercertificate.org): that you wrote the change, or otherwise have the right to give
it under the project's MIT license. CI checks every commit of a pull request for it. To sign off commits made without it, run
`git commit --amend -s` for the last one, or `git rebase --signoff main` for all of them.

Open a pull request against `main` with one change in it, and say what it fixes and how you checked it. CI runs every check on the
newest Node release and on the newest long-term support release.

### A first contribution

Issues labelled [good first issue](https://github.com/arcwrightstudio/svifa/labels/good%20first%20issue) are small and
self-contained, and say what done looks like. Say in the issue that you are taking one, so two people do not work on it at once.

### How a change is reviewed

Every pull request is reviewed and approved by a code owner (`.github/CODEOWNERS`) and passes every check before it merges, as one
squashed commit. A review asks:

- Does the change belong in Svifa, by the roadmap in the README and the rules above?
- Is there a test that fails without it, in every engine it runs in, and do the property tests still hold?
- Does it leave the browser's own keyboard, scroll bar, touch, find in page and reduced motion as they were?
- Is motion judged in time, giving the same result at any refresh rate?
- Does it add a dependency, or anything a strict Content Security Policy would refuse? Neither is accepted.
- Do the types, the JSDoc, the README and `llms.txt` describe it, and does `CHANGELOG.md` say what changed for users?
- Does every commit carry its sign-off?

The reviewer asks in the pull request for anything missing and approves once every point holds. A commit pushed after an approval
needs a new one.

## Security

Report a vulnerability privately, as [SECURITY.md](./SECURITY.md) describes, never in a public issue.
