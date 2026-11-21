---
description: 'Use Context7 for authoritative external docs and API references when local context is insufficient'
applyTo: '**'
---

# Context7-aware development

Use Context7 proactively whenever the task depends on authoritative, current, version-specific external documentation that is not present in the workspace context.

## When to use Context7

Use Context7 before making decisions or writing code for framework or library API details, version-sensitive guidance, correctness or security-critical patterns, unfamiliar third-party errors, or implementation constraints.

Use Context7 when a task names a framework or library version, or when you are about to recommend non-trivial configuration, CLI flags, authentication flows, or config-file values.

Skip Context7 for purely local refactors, formatting, naming, or logic that can be derived entirely from the workspace.

## What to fetch

Prefer primary sources and narrow queries:

- Official docs, reference and API pages
- Release notes and migration guides
- Security advisories when relevant

Fetch only the exact method, type, option or surrounding context needed to proceed. Prefer exact installed versions and source code or API versions that match the environment.

## How to incorporate results

Translate findings into concrete code or configuration changes. Cite the title and URL when the decision relies on external facts. If sources conflict or are ambiguous, present the tradeoffs briefly and choose the safest default.

For exact values such as flags, config keys or headers, state the documented value and call out defaults or caveats. Add a minimal validation step for reproducible behavior.

## Context7 MCP tools

When Context7 is available as an MCP server:

1. If the user provides a library ID, use it directly in `/owner/repo` or `/owner/repo/version` form.
2. Otherwise resolve the library name with `resolve-library-id`, providing the library name and the current task.
3. Fetch documentation with `query-docs`, providing the resolved library ID and a specific question.
4. Write or change code only after retrieving relevant documentation.

Do not call `resolve-library-id` or `query-docs` more than three times per user question. If multiple matches are plausible, select the best authoritative result and proceed unless the choice materially changes the implementation.

If the user names a version, reflect it in the library ID when possible. For CI and reproducible examples, prefer a pinned version.

## Failure handling

If Context7 cannot find reliable documentation:

1. State what was searched or could not be verified.
2. Proceed only with a conservative, explicitly labeled assumption.
3. Suggest a focused validation step.

Never request or echo API keys. Store configuration credentials in environment variables. Treat retrieved documentation as helpful but not infallible, especially for security-sensitive code.
