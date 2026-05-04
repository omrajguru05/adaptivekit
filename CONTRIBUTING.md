# Contributing to AdaptiveKit

AdaptiveKit is a focused toolkit. Every contribution that ships makes the codebase smaller, faster, or more correct. This document describes how to work with the project, what the bar looks like, and how to get a change from idea to merged.

## Before You Start

Read the codebase. It is small enough to do this in one sitting. The three packages under `packages/` are independent. Understanding how they fit together is the most important prerequisite for any contribution.

If you plan to change behavior in the scoring algorithm, the CLI codemod, or the SDK event model, open an issue first and describe the problem and your proposed approach. This is not bureaucracy. It is the fastest way to find out whether the direction aligns before you invest time writing code.

For typos, documentation corrections, and test additions, open a pull request directly.

## What We Are Looking For

The project values a small, well-understood surface area. A contribution is a good fit if it does one of the following:

- Fixes a bug with a clear reproduction case
- Adds a test that covers an existing behavior that was previously untested
- Improves documentation accuracy or clarity
- Adds an explicitly roadmapped feature (listed in the README under Roadmap)
- Improves performance with a measurable benchmark

A contribution is unlikely to be accepted if it:

- Adds a new configuration option that handles an edge case most users will never encounter
- Increases the SDK bundle size without a proportional benefit
- Introduces a runtime dependency to any of the three packages
- Changes the public API without a strong justification and a migration path

When in doubt, open an issue before writing code.

## Setup

```bash
git clone https://github.com/omrajguru05/adaptivekit.git
cd adaptivekit
npm install
npm run build
npm test
```

The repo is an npm workspace. Building and testing from the root runs across all three packages. Each package has its own `tsup` configuration and its own test suite. Build artifacts land in `packages/<name>/dist/` and are not committed to the repository.

## Making a Change

### 1. Fork and branch

Fork the repository and create a branch from `main`. Name the branch after what it does, not after you.

```
fix/cli-depth-filter-edge-case
feat/vue-composable
docs/scoring-algorithm-explanation
```

### 2. Write the code

Keep changes focused. A pull request that fixes a bug and also refactors an unrelated module takes longer to review and is harder to revert if one part turns out to be wrong. Separate concerns into separate pull requests.

Each package follows the same structure:

```
packages/<name>/
  src/        # Source files
  test/       # Test files
  dist/       # Build output (gitignored)
  package.json
  tsconfig.json
```

### 3. Write tests

Every behavioral change requires a test. The test should demonstrate the problem before your fix and pass after it. Tests that only confirm the happy path are not sufficient for bug fixes.

Run the full test suite before submitting:

```bash
npm test
```

### 4. Check bundle size

If your change touches `@adaptivekit/sdk` or `@adaptivekit/core`, check the bundle size after building:

```bash
npm run build
ls -lh packages/sdk/dist/index.js
ls -lh packages/core/dist/index.js
```

The SDK target is under 8 KB minified. The core engine has no hard limit but any increase requires justification in the pull request description.

### 5. Open the pull request

Use the pull request title to describe what changed, not what you did. "Fix CLI depth filter skipping top-level containers" is a good title. "Fixed a bug I found" is not.

The pull request description should answer three questions:

- What is the problem this change solves?
- How does the change solve it?
- How was it tested?

Link to the relevant issue if one exists.

## Code Standards

### TypeScript

All source files are TypeScript. No `any` types without a comment explaining why. All public functions and types require JSDoc comments. The compiler configuration is strict. A pull request that introduces type errors will not be merged.

### Formatting

The project uses Prettier with the default configuration. Run the formatter before committing:

```bash
npm run format
```

### Commit messages

Write commit messages in the imperative present tense. "Add cold start fallback" rather than "Added cold start fallback" or "Adding cold start fallback." Each commit should represent one logical change.

## Reporting Issues

A good bug report includes:

- The package version from `package.json`
- The framework and version (React 18, Next.js 14, etc.)
- A minimal reproduction case: the smallest possible code that demonstrates the problem
- What you expected to happen
- What actually happened, including any error messages in full

If the issue is a security vulnerability, do not open a public issue. Send a direct message through GitHub instead.

## Proposing New Features

Open an issue with the label `proposal` and describe:

- The problem you are trying to solve, with a concrete example
- Why the existing toolkit does not solve it
- What the proposed API or behavior looks like from the user's perspective
- What tradeoffs or edge cases you have considered

Proposals that arrive with a clear problem statement and a considered design are far more likely to move forward than proposals that arrive as feature requests without context.

## Review Process

Every pull request receives a review. The review focuses on correctness, test coverage, and fit with the existing design. Feedback is direct and specific. If a change is declined, the reason will be explained clearly.

A pull request is ready to merge when it has one approval, all tests pass, and the bundle size check passes. There is no merge queue or release train. Accepted changes ship in the next patch or minor release depending on scope.

## License

By contributing to AdaptiveKit, you agree that your contributions will be licensed under the MIT License that covers the project.
