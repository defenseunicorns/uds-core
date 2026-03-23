# Copilot Instructions

## Code Reviews

When reviewing code changes, read all files in `.ai/code/` for guidance. These files describe things to keep in mind when specific source files change.

## Documentation

- Read all files in `.ai/docs/` for templates, conventions, and guidance on documentation changes
- When reviewing docs changes, audit against `docs/dev/style-rules.md` (formatting, structure, tone rules) and `docs/dev/voice-profile.md` (project writing voice)
- Flag style-rules.md violations in review comments with the specific rule being violated
- Flag voice-profile.md deviations when tone, sentence style, or reader address doesn't match
- Use severity levels: CRITICAL (incorrect info, broken instructions), MAJOR (significant style/voice violations), MINOR (noticeable but non-blocking), NIT (cosmetic)
- Check the quick checklist at the end of style-rules.md as a final quality gate

## PR Reviews

When reviewing a pull request, check whether any existing documentation in `docs/` needs to be created or updated to reflect the changes in the PR. If so, leave a review comment noting which docs may need attention — do not make the changes yourself.
