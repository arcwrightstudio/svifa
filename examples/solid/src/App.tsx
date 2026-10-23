// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

import { createSignal } from 'solid-js'
import { SmoothScroll, useSvifa } from '@arcwrightstudio/svifa/solid'

function ReadingProgress() {
  const [progress, setProgress] = createSignal(0)
  useSvifa((svifa) => setProgress(svifa.progress))
  return <progress value={progress()} max={1} />
}

export function App() {
  return (
    // the page glides, and so do same-page links, stopping below the sticky header
    <SmoothScroll anchors={{ offset: -56 }}>
      <header>
        <nav>
          <a href="#one">One</a>
          <a href="#two">Two</a>
          <a href="#three">Three</a>
          <a href="#top">Top</a>
        </nav>
        <ReadingProgress />
      </header>
      <main>
        <section id="one">
          <h1>Svifa</h1>
          <p>Turn the mouse wheel or swipe on the trackpad, and the page glides to where you sent it.</p>
        </section>
        <section id="two">
          <h2>Out of the way</h2>
          <p>The keyboard, the scroll bar, touch and find in page stay the browser's own, and take over at once.</p>
        </section>
        <section id="three">
          <h2>Between pixels</h2>
          <p>Scroll slowly and watch the text: it moves evenly to the end, with no one-pixel hops as it settles.</p>
        </section>
      </main>
    </SmoothScroll>
  )
}
