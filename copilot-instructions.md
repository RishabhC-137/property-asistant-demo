# Global Copilot Instructions

## Development philosophy

- Prefer simple, readable solutions over clever abstractions.
- Do not introduce abstractions or utilities without a real need.
- Follow existing project conventions, architecture and package-manager workflows.
- Keep comments scarce and meaningful; do not comment obvious code.
- Keep changes scoped to the requested outcome.
- Avoid unnecessary dependencies and refactors.
- Prefer existing libraries and utilities where appropriate.
- Handle edge cases without unnecessary complexity.
- Optimize for maintainability and code another developer can understand.

## Product and UI philosophy

- Do not generate generic AI-looking interfaces.
- Avoid repetitive cards, gradients, excessive rounding and predictable layouts.
- Establish clear visual hierarchy through intentional typography, spacing, proportion and contrast.
- Design for the actual product, audience and purpose.
- Every visual element must have a reason to exist.
- Consider empty, loading, error, success and responsive states.
- Verify rendered interfaces rather than assuming an implementation looks correct.
- Prefer purposeful interaction over decoration or unnecessary animation.
- Prioritize usability, accessibility and clarity.

## Content philosophy

- Write like a real person speaking to another person.
- Avoid marketing filler, AI cliches and exaggerated claims.
- Use specific, product-relevant copy rather than placeholders.
- Keep headings, labels and descriptions natural and concise.
- Match tone to the product and audience.

## Documentation-first development

- Inspect `package.json` and relevant lockfiles before changing dependencies or implementing library-specific behavior.
- Use Context7 for unfamiliar APIs or library features when local workspace context is insufficient.
- Prefer documentation for the exact installed library version.
- Prioritize official vendor documentation. For Microsoft technologies, use Microsoft Learn.
- Verify API signatures, deprecated methods, configuration options and breaking changes.
- Never invent APIs or rely solely on model memory.
- Avoid random blogs and generic web searches when authoritative documentation is available.
- Do not upgrade dependencies without a clear justification and approval.
- Fetch only documentation relevant to the current task.
- If documentation cannot be retrieved, disclose that limitation and use only a conservative, labeled assumption.
- Cite official sources when an implementation relies on external documentation.

## Skill use

Discover available skills instead of assuming they are missing. Check the actual installed skill locations and read the relevant `SKILL.md` before using a skill. Skills may be scoped to a particular project; if one is unavailable, continue with sound judgment rather than assuming it is installed globally.

Select skills based on the task, prefer the most relevant skill as the primary guide, combine skills only when they add complementary value, and avoid invoking overlapping skills unnecessarily. Do not copy skill manuals into these global instructions or blindly follow conflicting skill directions.

The skills installed for the current project include:

### UI/UX and frontend

- `ui-ux-pro-max`: primary design intelligence for design systems, styles, typography, color, charts and UX guidance.
- `anti-ui-slop`: challenge generic AI-looking interfaces and guide deliberate visual design.
- `premium-frontend-ui`: craft sophisticated frontend experiences when the task warrants it.
- `web-design-reviewer`: inspect and improve rendered interfaces, including responsive behavior and accessibility.
- `gsap-framer-scroll-animation`: use for meaningful scroll-tied animation with GSAP or Framer Motion.

### Code quality and engineering workflow

- `harness-engineering`: improve repository-level agent instructions, constraints, feedback, failure memory and enforceable checks.
- `lean-comments`: keep maintained source comments and declaration documentation useful and minimal.
- `code-exemplars-blueprint-generator`: identify strong code examples and derive project-specific implementation conventions.
- `tiny-stepping`: make small, validated increments when a task benefits from iterative feedback.
- `refactor`: improve maintainability without changing behavior when refactoring is requested or directly supports the task.

### Content and conversion

- `make-blog-post`: develop editorial content from code while matching the author's voice and waiting for draft approval before saving.
- `landing-page-conversion-audit`: assess landing-page messaging and conversion issues.

### Product discovery and requirements

- `ai-team-orchestration`: coordinate distinct perspectives when planning, adopting or brainstorming around a project.
- `first-ask`: clarify scope and constraints before execution when the task is underspecified.
- `ponder`: examine difficult decisions or broad audits in a deliberate, convergent way when requested.
- `prd`: document product requirements after discovery and decisions are approved.

### Documentation

- `microsoft-docs`: use Microsoft Learn MCP for Microsoft documentation hosted on Learn; use the skill's documented alternatives for Microsoft materials hosted elsewhere.
- Context7 MCP: use for version-specific library documentation and non-Microsoft Learn sources, following the global Context7 instructions.

Use only skills relevant to the task. This inventory records the project skills requested during this session; it does not imply they are installed in every workspace.

## Product discovery mode

For a new product, application concept, feature idea or significant change, do not immediately start coding.

First clarify the product problem, intended users, existing alternatives, constraints, success criteria and the smallest useful version. Challenge assumptions, identify uncertainty and present tradeoffs before implementation. Do not substitute internal discussion for decisions that require the user's input.

Where useful and available, use distinct perspectives:

1. **Product:** user problem, target users, alternatives, outcomes and success measures.
2. **Engineering:** feasibility, architecture, dependencies, risks and implementation scope.
3. **Design:** user flows, interaction, accessibility, visual direction and required states.
4. **Critical review:** challenge assumptions, identify failure cases and compare tradeoffs.

Use ai-team-orchestration when coordinating these perspectives provides real value; do not create extra agents for simple work. Ask focused questions when a decision materially changes the product or implementation. Once the user approves a direction, proceed with clearly labeled assumptions, use `prd` when a requirements document is useful, and implement the smallest valuable version.
