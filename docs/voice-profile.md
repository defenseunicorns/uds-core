# Voice Profile

> **Note:** Two distinct registers appear across these sources. Published user-facing docs use
> "you" address and GFM alert callout syntax. Internal design docs use "we" and GitHub aside blocks.
> This profile covers published docs as the primary target. See "Internal Design Docs" section for
> the divergent patterns.

## Tone
Peer-level technical authority, confident without being condescending. Explains *why* alongside
*how*. States limitations and caveats directly rather than softening them. No filler, no marketing
language, no throat-clearing. Warm enough to feel human; terse enough to respect the reader's time.

## Sentence Style
Mixed length, deliberate rhythm. Lead sentence establishes context or purpose; follow-up sentences
build on it or branch into specifics. Conditional logic expressed inline: "If X, then Y" rather
than a separate warning block. Avoids stacking subordinate clauses, breaks complexity into
sequential short sentences instead.

**Characteristic pattern, context then action then constraint:**
> "UDS Core lets you expose services on custom Istio gateways beyond the standard tenant, admin,
> and passthrough gateways. While the standard gateways fit most use cases, you might need a custom
> gateway for specialized security, different access control, unique TLS settings, or custom domain
> routing."

**Characteristic pattern, imperative then consequence:**
> "Note that you *MUST* include the default list of ports (as shown above) to ensure that HTTP
> traffic and liveness checks continue to function as expected."

## Reader Address
Second-person "you" throughout published docs. No "we" except when referring to the Defense
Unicorns team explicitly ("We reserve the right to..."). No contractions in formal reference
docs; occasional contractions acceptable in tips and callouts. Passive voice avoided, system
is always the subject when the user isn't ("The UDS Operator handles...", "UDS Core deploys...").

## Technical Density
High. Kubernetes, Istio, Helm, Zarf, Prometheus, OAuth2, CRDs, service mesh, all used without
definition. Acronyms (SSO, TLS, DNS, CRD, HA, CVE) used freely. Inline backticks for all
resource names, field paths, namespaces, flag names, CLI commands, and config keys. Links
provided for cross-references rather than inline repetition, ends sections with
"Reference the [spec for X](...) for all available fields."

## Verb Preference
Imperative for instructions ("Set an override", "Verify", "Run"). Declarative for system
behavior ("The operator handles", "UDS Core deploys"). Modal verbs used precisely:
- `must`, hard requirement, security or correctness
- `will`, guaranteed system behavior
- `should`, strong recommendation
- `may`, optional or situational
- `can`, capability available to the user

No weak noun constructions: "configure" not "perform configuration", "upgrade" not "run an
upgrade process".

## Structure Defaults

**Intro pattern:** Every doc/section opens with one or two sentences stating what it covers and
why. Never starts with a list or code block, always prose first.

**Lead-in before code:** Code blocks are always preceded by a prose sentence that frames them.
Never a naked code block under a heading.
> "To accomplish this, you can provide a bundle override as follows:"
> "The below example shows how to create a zarf package for a 'custom' gateway:"

**Callout syntax:** GFM alert syntax for published docs:
```md
> [!NOTE]
> Content

> [!TIP]
> Content

> [!IMPORTANT]
> Content

> [!WARNING]
> Content

> [!CAUTION]
> Content
```
Reserve `<aside>` blocks and Starlight `:::note` syntax for internal design docs only.

**Lists:** Bullet lists for non-sequential items, always with an intro sentence. Numbered
lists for sequential steps. Never a list directly under a heading with no lead-in prose.

**Section endings:** Configuration sections typically end with a reference link:
> "Reference the [spec for allow](...) for all available fields."

**Code blocks:** Always include language identifier. YAML for all Kubernetes resources and
bundle configs. `console` for terminal commands showing output. `bash` for non-interactive
shell commands. Inline comments to explain non-obvious fields.

## Do
- Open every doc and major section with a one-or-two sentence purpose statement
- Use backticks for every resource name, field path, flag, namespace, and config key inline
- Precede every code block with a framing sentence
- End configuration sections with a "Reference the [spec]" link
- State constraints and caveats inline, close to the relevant instruction
- Use `must` precisely, only for hard correctness or security requirements
- Use GFM alert callout syntax (`> [!NOTE]`, `> [!TIP]`, `> [!CAUTION]`) in published docs
- Bold UI element names and key terms on first emphasis
- Use `console` for terminal output; `yaml` for all K8s/bundle configs

## Don't
- Start a section or doc with a list or code block, always prose first
- Use passive voice when the actor is known
- Use Starlight `:::note` admonition syntax in published docs
- Repeat information that exists elsewhere, link to it instead
- Add filler qualifiers: "simply", "just", "easy", "straightforward", "please note"
- Use "we" when addressing the reader, reserve it for the DU/UDS team voice
- Stack subordinate clauses, break them into separate sentences

## Internal Design Doc Divergence
When writing internal design docs (GitHub-rendered, not Starlight):
- Switch to "we" for design decisions: "we will add...", "we need to ensure..."
- Use `<aside>`, `> [!NOTE]`, or Starlight `:::note` syntax for callouts
- System-as-subject for implementation steps: "The UDS Operator will check..."
- Numbered lists for reconciliation/validation flows are the primary structure
- Include rationale and alternatives considered, not just what, but why
