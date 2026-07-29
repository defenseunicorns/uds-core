For code changes, read all files in `.agents/rules/` for guidance on changes (such as keeping documentation and other artifacts in sync with source code).

When modifying any file that has a copyright header, ensure the year includes the current year. If the header says `Copyright 2024` and the current year is 2026, update it to `Copyright 2024-2026`. If it already includes the current year, leave it as-is.

For docs work, use the `documentation-authoring` skill in `.agents/skills/`. Read its relevant references along with `docs/dev/style-rules.md` and `docs/dev/voice-profile.md`. If a convention or pattern changes during docs work, update the relevant reference to keep it as the source of truth for how docs should be written.

When writing or editing documentation, apply the style rules in `docs/dev/style-rules.md` and match the voice profile in `docs/dev/voice-profile.md`. Use the quick checklist in style-rules.md as a final quality gate before delivering any docs changes.

When reviewing documentation (your own or others'), audit against both style-rules.md and voice-profile.md. Classify issues by severity: CRITICAL (incorrect info, broken instructions), MAJOR (significant style/voice violations), MINOR (noticeable but non-blocking), NIT (cosmetic).

When drafting or updating release notes, follow the workflow in `.agents/skills/draft-release-notes/SKILL.md` and use the documentation-authoring skill for the applicable style and template references.

## Agent configuration

- `.agents/skills/` contains reusable procedural guidance and skill-specific references.
- `.agents/rules/` contains focused repository rules that apply to code changes.
- `AGENTS.md` is the only general instruction file; do not duplicate its guidance elsewhere.

## Pull request reviews

When reviewing a pull request, check whether existing documentation in `docs/` needs to be created or updated to reflect the changes. If documentation needs attention, leave a review comment identifying it rather than making the documentation changes yourself.
