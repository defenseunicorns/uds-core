For code changes, read all files in `.ai/code/` for guidance on changes (such as keeping documentation and other artifacts in sync with source code).

When modifying any file that has a copyright header, ensure the year includes the current year. If the header says `Copyright 2024` and the current year is 2026, update it to `Copyright 2024-2026`. If it already includes the current year, leave it as-is.

For docs work, read all files in `.ai/docs/` for templates, conventions, and guidance. If a convention or pattern changes during docs work, update the relevant file in `.ai/docs/` to reflect the change — these are the source of truth for how docs should be written.

When writing or editing documentation, apply the style rules in `docs/dev/style-rules.md` and match the voice profile in `docs/dev/voice-profile.md`. Use the quick checklist in style-rules.md as a final quality gate before delivering any docs changes.

When reviewing documentation (your own or others'), audit against both style-rules.md and voice-profile.md. Classify issues by severity: CRITICAL (incorrect info, broken instructions), MAJOR (significant style/voice violations), MINOR (noticeable but non-blocking), NIT (cosmetic).
