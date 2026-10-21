// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

// This folder is the project, whatever lockfiles sit in the folders above it, and Next writes no AGENTS.md into it.
/** @type {import('next').NextConfig} */
const config = { turbopack: { root: import.meta.dirname }, outputFileTracingRoot: import.meta.dirname, agentRules: false }

export default config
