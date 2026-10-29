# Issue tracker: GitHub

Issues and specs live in GitHub Issues for `yuewen-ye/daily-arXiv-ai-enhanced`.
Use the `gh` CLI and pass `--repo yuewen-ye/daily-arXiv-ai-enhanced`
explicitly so operations target this repository when both origin and upstream exist.

## Conventions

- Create: `gh issue create --repo yuewen-ye/daily-arXiv-ai-enhanced --title "..." --body-file <file>`.
- Read: `gh issue view <number> --repo yuewen-ye/daily-arXiv-ai-enhanced --json number,title,body,labels,comments`.
- List: `gh issue list --repo yuewen-ye/daily-arXiv-ai-enhanced --state open --json number,title,body,labels`, adding label or state filters as needed.
- Comment: `gh issue comment <number> --repo yuewen-ye/daily-arXiv-ai-enhanced --body-file <file>`.
- Apply or remove labels: `gh issue edit <number> --repo yuewen-ye/daily-arXiv-ai-enhanced --add-label "..."` or `--remove-label "..."`.
- Close: `gh issue close <number> --repo yuewen-ye/daily-arXiv-ai-enhanced`.
- For multiline bodies, write the exact text to a temporary file and use `--body-file`.
- For triage label names, read `docs/agents/triage-labels.md`.

## Parent and child issues

Use GitHub sub-issues when supported. To link an existing child:

`gh api --method POST repos/yuewen-ye/daily-arXiv-ai-enhanced/issues/<parent>/sub_issues -F sub_issue_id=<child-database-id>`

Obtain the database id with:

`gh api repos/yuewen-ye/daily-arXiv-ai-enhanced/issues/<child> --jq .id`

If sub-issues are unavailable, put `Part of #<parent>` at the top of
the child body and link the child in the parent's task list.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Skill instructions

When a skill says "publish to the issue tracker", create a GitHub issue
in this repository.

When a skill says "fetch the relevant ticket", read the corresponding
GitHub issue, including its labels and comments.

## Wayfinding operations

- Map: one issue labelled `wayfinder:map`, containing Notes, Decisions-so-far, and Fog.
- Child tickets: link to the map using sub-issues, or the parent/child fallback above.
  Use `wayfinder:<type>` for research, prototype, grilling, or task tickets.
- Blocking: use GitHub native issue dependencies when available:

  `gh api --method POST repos/yuewen-ye/daily-arXiv-ai-enhanced/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-database-id>`

  If unavailable, maintain a `Blocked by: #<number>` line at the top of the child body.
- Frontier: inspect the map's open children in map order; select the first
  unassigned ticket with no open blockers.
- Claim: assign the selected ticket to the driving developer.
- Resolve: comment with the result, close the ticket, and append a brief
  result and ticket link to the map's Decisions-so-far.
