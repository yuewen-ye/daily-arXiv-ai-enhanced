# Domain Docs

This repository uses a single-context layout.

## Before exploring

- Read root `GLOSSARY.md` when it exists.
- Read decisions in `docs/adr/` relevant to the area being explored.
- If these files or directories are absent, proceed silently.
  Create domain documentation lazily through `/domain-modeling`
  when terms or decisions are actually resolved.

## Layout

- `GLOSSARY.md`: shared domain terms at the repository root.
- `docs/adr/`: architecture decision records, such as
  `0001-<decision-title>.md`.

## Use the glossary's vocabulary

Use the glossary's terms when naming domain concepts in issues,
proposals, hypotheses, and tests. Follow its preferred terms and
explicitly avoided synonyms.

If a needed concept is missing, check whether it matches the project's
language. Note a real vocabulary gap for `/domain-modeling`.

## Surface decision conflicts

If a proposal contradicts an existing ADR, identify the ADR and explain
why the decision should be reconsidered.
