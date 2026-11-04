2026-07-08 — Update System Specification
    Context:
    Change:
    Verification:
    Risks:
Rollback:

2026-11-04 — Document architecture and skip Markdown-only branch builds
    Context: The project lacked a local architecture overview and documentation-only pushes triggered image publication.
    Change: Add an architecture overview and ignore Markdown-only branch pushes in the release workflow while retaining pull request and tag triggers.
    Verification: Validate workflow policy and inspect the workflow and documentation changes locally.
    Risks: GitHub evaluates branch path filters from changed files; tag pushes are not filtered by paths.
    Rollback: Remove the path filter and architecture document, and revert the associated policy check.
