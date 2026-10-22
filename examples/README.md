# Examples

Each opens on StackBlitz, ready to run and change:

- [Vite](https://stackblitz.com/github/arcwrightstudio/svifa/tree/main/examples/vite): plain TypeScript, with a reading progress bar from Svifa's scroll event.
- [Next.js](https://stackblitz.com/github/arcwrightstudio/svifa/tree/main/examples/next): the App Router, with `SmoothScroll` in the root layout and `useSvifa` in a client component.
- [Vue](https://stackblitz.com/github/arcwrightstudio/svifa/tree/main/examples/vue): Vite and Vue, with `SmoothScroll` around the app and `useSvifa` in a component.
- [Nuxt](https://stackblitz.com/github/arcwrightstudio/svifa/tree/main/examples/nuxt): the Vue component in `app.vue`, rendered on the server.
- [SvelteKit](https://stackblitz.com/github/arcwrightstudio/svifa/tree/main/examples/sveltekit): `smoothScroll` in the root layout and `useSvifa` in a component, rendered on the server.
- [Solid](https://stackblitz.com/github/arcwrightstudio/svifa/tree/main/examples/solid): Vite and Solid, with `SmoothScroll` around the app and `useSvifa` in a component.
- [Angular](https://stackblitz.com/github/arcwrightstudio/svifa/tree/main/examples/angular): `provideSmoothScroll` in the app's providers, `injectSvifa` for the reading progress, and a box with a Svifa of its own from `createSvifa`, rendered on the server.
- [Astro](https://stackblitz.com/github/arcwrightstudio/svifa/tree/main/examples/astro): `SmoothScroll` in the layout, with view transitions between two pages.
- [A plain page](https://stackblitz.com/github/arcwrightstudio/svifa/tree/main/examples/html): one HTML file, with Svifa from a CDN.

All of them glide the page, glide to same-page links (stopping below the sticky header) and draw the content between pixels while it
moves. On every change each is built with its framework's own tool, from the package as it would be published, and driven in a
browser (`npm run check:examples`).
