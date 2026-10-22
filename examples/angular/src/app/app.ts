// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

import { Component, ElementRef, signal, viewChild } from '@angular/core'
import { createSvifa, injectSvifa } from '@arcwrightstudio/svifa/angular'

@Component({
  selector: 'app-root',
  template: `
    <header>
      <nav>
        <a href="#one">One</a>
        <a href="#two">Two</a>
        <a href="#three">Three</a>
        <a href="#top">Top</a>
      </nav>
      <progress [value]="progress()" max="1"></progress>
    </header>
    <main>
      <section id="one">
        <h1>Svifa</h1>
        <p>Turn the mouse wheel or swipe on the trackpad, and the page glides to where you sent it.</p>
      </section>
      <section id="two">
        <h2>Out of the way</h2>
        <p>The keyboard, the scroll bar, touch and find in page stay the browser's own, and take over at once.</p>
        <div class="box" #box>
          @for (line of lines; track line) {
            <p>Line {{ line }} of a box that glides with a Svifa of its own.</p>
          }
        </div>
      </section>
      <section id="three">
        <h2>Between pixels</h2>
        <p>Scroll slowly and watch the text: it moves evenly to the end, with no one-pixel hops as it settles.</p>
      </section>
    </main>
  `,
})
export class App {
  protected readonly progress = signal(0)
  protected readonly lines = Array.from({ length: 30 }, (_, i) => i + 1)
  private readonly box = viewChild.required<ElementRef<HTMLElement>>('box')

  constructor() {
    // the reading progress, from the page's Svifa (made by provideSmoothScroll in app.config.ts)
    injectSvifa((svifa) => this.progress.set(svifa.progress))
    // the box's own Svifa, made once the box is on the page
    createSvifa(() => ({ scroller: this.box().nativeElement }))
  }
}
