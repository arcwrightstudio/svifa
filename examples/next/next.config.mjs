// This folder is the project, whatever lockfiles sit in the folders above it.
/** @type {import('next').NextConfig} */
const config = { turbopack: { root: import.meta.dirname }, outputFileTracingRoot: import.meta.dirname }

export default config
