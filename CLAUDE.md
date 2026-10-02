# Rules every agent follows in this repository

Read the brief you were given and the spec sections it names. The specification, the research and every other document are kept outside this repository; the brief says where. This repository holds code, configuration and the content the app reads, nothing else. Then obey the following. They are not suggestions.

1. Build only what the brief and the named spec sections say. Nothing extra. If it is not in the brief, it is not in the pull request.
2. TypeScript strict. No `any`. Every data shape comes from `packages/schema`; do not redeclare a shape in a screen or a service.
3. Never invent a rule, a date, a fee or a step. Rules come only from `content/` files and the research the brief names, each with a source. Unsure means write "unknown", never a guess.
4. Nothing in this product computes or tracks fines.
5. English only. Every screen works in light and dark, at a phone width and at a desktop width. Use logical CSS properties (`margin-inline`, `inset-inline-start`, `padding-block`, start and end rather than left and right) so a right-to-left language costs nothing later.
6. Never read a `.env` file. Never touch anything under a folder named `Company-Legal`. Never copy a key from another project.
7. No absolute paths in any file. No dependency added without a reason stated in the commit message and the pull request.
8. `packages/rules` has no browser imports. The app has no date arithmetic outside `packages/rules`.
9. Languages: TypeScript, CSS, JSON, Markdown. YAML only for CI. SQL only in the backend contract. No Python, no untyped JavaScript, no other language without written approval in the pull request.
10. English in code, comments, commits and docs. No em dashes anywhere; use commas or full stops.
11. Leave the Brain seam intact: `CompanyFacts`, `RequirementClassifier`, `Assistant`, `SetupJourney`, the assistant slot in the chrome, and the add-company route with its two branches. Every screen renders data objects the assistant can read; nothing lives only inside a component.
12. Phone-app constraints: hash routing, relative asset paths, sessions in storage (not cookies), no browser-only API without a small adapter.
13. Pull requests go to `dev`, name the spec sections they implement, and must pass CI (typecheck, lint, test, build). Commit messages carry the role and what changed, for example `foundation: add schema package`.
14. Every role works in its own git worktree, never in the shared checkout: `git worktree add .claude/worktrees/<role> -b feat/<role> origin/dev` from the repository root, then every command runs inside that folder. Two roles in one checkout commit onto each other's branches.
15. No documents in the repository: no specs, research, decision records, status notes, screenshots or READMEs beyond the root one. Comments in code explain code.
