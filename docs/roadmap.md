# Roadmap

## Purpose

This document records the medium-term roadmap for the project beyond the original Phase 1 slice.

Use `docs/phase-2-plan.md` for the current execution plan.
Use `docs/phase-1-roadmap.md` only as the historical record of the original first-slice rollout.

## Historical Phase 1

Original focus:

- single-file editing
- WAV-first analysis
- conservative tonal shaping and cleanup
- contract-first pipeline reliability

Historical detailed plan:

- see `docs/phase-1-roadmap.md`

## Phase 2

Goal:

- make the system meaningfully better at real LLM-driven editing without widening the product too early.

Phase 2 should still protect the core product framing:

- this is an audio manipulation platform for LLMs
- it should stay contract-first and inspectable
- new capabilities should deepen the current workflow more than they broaden the surface area randomly

The main outcome of Phase 2 should be a much stronger editing loop for supported requests, not a much larger but less reliable feature matrix.

The repository now already includes:

1. published runtime capability discovery
2. planning grounded against capability metadata rather than transform internals
3. a broad deterministic Layer 1 runtime surface spanning level, timing, tonal, dynamics/control, stereo/routing, restoration, and creative effect operations
4. first-cohort `time_range` targeting for duration-preserving, channel-stable operations, now including a narrow planner-grounded numeric region slice
5. measurement-aware `normalize` execution plus runtime restoration primitives such as `de_esser`, `declick`, and `dehum`

That means the next Phase 2 work is no longer "add the first serious transforms."
It is to deepen reliability, comparison quality, and planner coverage around the much larger runtime surface that already exists.

See `docs/phase-2-plan.md` for the current execution order, module tasks, and testing expectations.

### Deeper runtime precision

- deepen the current runtime so its broad operation set becomes easier to target, verify, and plan against safely
- prioritize precision gaps such as stronger compare behavior, richer planner grounding, and the remaining hard region-targeting cases beyond the new numeric `time_range` slice

Why this matters:

- the runtime now covers far more than the original tonal-shaping core, but some of that surface is still runtime-only or only partially verifiable
- natural-language editing quality depends more on precise contracts and comparison signals than on adding more raw effect count
- the planner only becomes more useful when runtime breadth is paired with honest capability metadata and measurable outcomes

Priority runtime follow-ups:

1. improve verification and compare behavior for existing runtime transforms
2. expand planner support where the capability manifest says the runtime is ready
3. finish the remaining hard Layer 1 gaps, especially tail-aware region targeting and deeper runtime ergonomics
4. add carefully chosen new runtime transforms only after they have contract, compare, and planner justification

Recommended order:

1. make the current runtime surface easier to plan and verify correctly
2. extend planner coverage only when semantics and compare can support the feature honestly
3. close the most important runtime gaps before widening the surface further

Key workstreams:

- keep the capability manifest synchronized with the real runtime surface
- improve compare and semantics coverage for the existing runtime transforms
- extend planner support only for operations marked `planner_supported`
- emit exact execution metadata in `TransformRecord`
- document tradeoffs, side effects, and safe ranges for each runtime operation
- extend render and compare where richer transforms introduce new failure modes

Module impact:

- `transforms`: harden current operations, target support, and runtime ergonomics
- `planning`: learn when to use them and when not to
- `compare`: detect whether they helped or introduced regressions
- `tools`: expose or guard them through the tool boundary
- `docs`: explain what each transform means in LLM-facing terms

Risks:

- runtime capability sprawl without enough planner discipline
- effects with hidden defaults that make runs hard to reason about
- transforms that technically work but are not measurable enough for compare/evaluation
- adding transforms whose semantics are too fuzzy for the current analysis layer

Success criteria:

- existing and new runtime operations are deterministic, documented, and covered by tests
- planning and compare can reason about the runtime surface explicitly
- the capability manifest remains the source of truth for runtime availability and planner support
- runtime additions improve supported requests instead of expanding unsupported ones silently

### Stronger prompt handling

- improve parsing of natural-language requests
- support more nuanced wording within the supported scope
- ask clearer questions or fail more explicitly when requests are ambiguous or unsupported

Why this matters:

- the platform only becomes useful when human intent can be turned into safe, explicit edits reliably
- users naturally speak in mixed semantic and technical language
- the planner should not guess blindly when a request is underspecified or out of scope

Scope of improvement:

- recognize broader phrasing for the current supported descriptor families
- separate intent into categories such as tonal change, cleanup, dynamics preservation, and unsupported creative requests
- identify requests that require clarification before action
- identify requests that should be rejected because the current transform set cannot satisfy them safely

Key workstreams:

- expand request parsing heuristics and phrase normalization
- improve mapping between semantic intent and supported edit objectives
- add unsupported-request categories with explicit error messages
- add clarification pathways for ambiguous prompts such as:
  - `make it better`
  - `make it hit harder`
  - `make it warmer and bigger`
- document the current accepted prompt family and its boundaries

Module impact:

- `planning`: primary owner of request interpretation
- `semantics`: helps define the vocabulary that can be mapped safely
- `tools`: should expose clearer argument and runtime errors
- `orchestration`: should preserve and surface clarification or failure states cleanly

Risks:

- overly broad prompt support claims without transform or analysis support
- silent fallback behavior that makes bad edits look intentional
- prompt parsing becoming too coupled to one exact benchmark wording set

Success criteria:

- prompt interpretation is more reliable for supported requests
- unsupported requests fail clearly instead of producing low-confidence edits
- prompt handling remains conservative and explainable
- the system can distinguish between `unsupported`, `ambiguous`, and `supported but limited`

### Better orchestration behavior

- improve iterative refinement flows such as `more`, `less`, `undo`, and retry variants
- make orchestration more robust to partial failures and repeated edit cycles
- preserve explicit session state across iterations

Why this matters:

- audio editing is usually iterative, not one-shot
- LLM usefulness grows a lot once the system can revise rather than restart from scratch
- orchestration is where independent modules become a product-like editing loop

Primary orchestration goals:

- support repeated request cycles against the same session
- interpret follow-up requests in the context of prior versions and plans
- expose partial results safely when a later stage fails
- make retries, undo, and branching predictable

Key workstreams:

- improve iteration-aware request cycle APIs
- add flow support for:
  - `more`
  - `less`
  - `undo`
  - `revert to previous version`
  - `try another version`
- preserve `SessionGraph` correctness across repeated edits
- make partial failure handling explicit and inspectable
- expand integration tests to cover consecutive edits instead of only a single pass

Module impact:

- `orchestration`: primary owner
- `history`: must remain correct under repeated flows
- `tools`: may need session-aware behavior for follow-up calls
- `compare`: should support repeated directional checks across branches or iterations

Risks:

- hidden orchestration state that bypasses the history layer
- follow-up requests being interpreted without enough context discipline
- orchestration reimplementing logic that belongs in lower-level modules

Success criteria:

- the full request cycle is reliable across multiple consecutive edits
- history and provenance remain correct after iterative refinement
- orchestration stays thin and compositional
- failures at later stages still leave valid, inspectable partial session state

### Better semantics

- improve descriptor calibration and confidence handling
- expand the quality of interpretation for traits like brightness, harshness, cleanliness, width, and punch
- make semantic summaries more useful without overstating confidence

Why this matters:

- semantics is the bridge between measurements and user language
- weak semantic mapping makes planning brittle and user trust low
- better semantics improves both direct tool explanations and edit planning quality

Scope of semantic improvement:

- make descriptor rules more calibrated on real examples
- improve confidence handling when evidence conflicts
- make summary language useful to LLMs without pretending uncertainty does not exist
- expand descriptor support carefully around the current supported request families rather than trying to cover every possible studio term

Key workstreams:

- recalibrate descriptor thresholds against better analysis signals
- improve evidence-to-label mapping for:
  - bright
  - dark
  - harsh
  - cleaner
  - punch-preserving situations
  - width-related descriptors
- improve unresolved-term output when the current evidence is insufficient
- make rationale strings more reusable by planning and tools
- ensure semantic summaries do not overstate source classification confidence

Module impact:

- `semantics`: primary owner
- `analysis`: provides the measurable basis that semantics depends on
- `planning`: consumes semantic signals as edit guidance
- `compare`: may reuse semantic vocabulary for before/after deltas

Risks:

- semantics drifting into subjective claims unsupported by analysis
- too many labels too early, reducing trust in the current output
- summary language sounding confident while the evidence is weak or mixed

Success criteria:

- semantic profiles better match measured evidence and user language
- planning receives more actionable, trustworthy semantic signals
- ambiguity and uncertainty remain explicit
- semantic improvements help the first prompt family measurably, not just descriptively

## Phase 3

Goal:

- make the project more rigorous, more usable for outside contributors, and easier to evaluate as a serious open source platform.

Phase 3 is less about adding flashy capabilities and more about making the existing system believable, repeatable, and sustainable.

The main outcome of Phase 3 should be that other people can evaluate the project, contribute to it, and trust the claims it makes.

### Real fixture set

- add small, licensed, committed audio fixtures representing real use cases
- document provenance, licensing, and intended usage for each fixture
- reduce dependence on synthetic-only validation

Why this matters:

- synthetic audio is useful for deterministic testing, but it does not represent real audio editing problems well enough on its own
- a serious audio tool platform needs real examples to tune semantics, planning, transforms, and comparison behavior
- fixtures become the shared ground truth for contributors and benchmarks

Fixture strategy:

- keep files small and commit-friendly
- prefer WAV or lossless fixtures for deterministic analysis/transforms
- cover the first supported slice before broadening
- document each fixture with:
  - source
  - license
  - known characteristics
  - intended test or benchmark use

Suggested first fixture categories:

- bright and slightly harsh loop
- darker balanced loop
- slightly noisy sample
- transient-heavy drum sample
- narrow stereo sample

Module impact:

- `fixtures/audio`: primary home for the assets and metadata
- `analysis`: better real-world coverage
- `semantics`: calibration input
- `planning`, `compare`, `benchmarks`, and `tests/integration`: stronger realism

Risks:

- unclear licensing or provenance
- fixtures that are too large for practical CI use
- fixture set growing without a clear mapping to supported use cases

Success criteria:

- fixture coverage exists for the first supported prompt family
- tests and benchmarks can run against committed real assets
- fixture provenance is clearly documented
- synthetic fixtures remain where useful, but are no longer the only serious validation path

### End-to-end evaluation

- build stronger end-to-end evaluation around the real fixture set
- score whether edits moved in the requested direction
- detect regressions over time with repeatable reports

Why this matters:

- without evaluation, the project can only say that it runs, not that it improves sound in the intended direction
- end-to-end evaluation is what turns the project from a codebase into a measurable system
- it also provides a stable target for future contributors and agents

Evaluation goals:

- score whether the output moved toward the request
- detect obvious regressions such as clipping, lost punch, or broken provenance
- compare benchmark performance across commits or releases

Key workstreams:

- tie the benchmark harness to real fixtures
- define expected directional outcomes for the first prompt family
- make reports diffable over time
- decide what belongs in CI versus what belongs in slower benchmark runs
- distinguish between:
  - unit correctness
  - integration correctness
  - product-quality directional success

Module impact:

- `benchmarks`: primary owner
- `compare`: central evaluation signal provider
- `tests/integration`: workflow-level validation
- `docs`: must explain what benchmark scores do and do not mean

Risks:

- pretending subjective audio quality can be fully reduced to one scalar score
- benchmark drift when prompt wording and fixture coverage are not versioned carefully
- evaluation metrics that reward gaming the compare layer instead of improving outputs

Success criteria:

- benchmark results can be compared across changes
- the happy path is evaluated on real fixture-backed flows
- regressions are visible in CI or benchmark reports
- contributors can explain what a score means and why it moved

### Contributor ergonomics

- improve onboarding for open source contributors
- add clearer contribution norms, issue structure, and extension guidance
- reduce friction for module-scoped work by outside contributors and agents

Why this matters:

- this repository is explicitly designed for parallel work by agents and humans
- open source quality depends heavily on how easy it is to understand boundaries and validate changes
- contributor friction is one of the fastest ways for modular architecture to decay

Key workstreams:

- add a stronger contribution guide and contribution checklist
- add issue templates and pull request templates
- document fixture contribution rules and license expectations
- document how to add a new contract, tool, transform, or benchmark safely
- keep module overview and API docs aligned with current code

Contributor experience goals:

- a contributor should be able to identify the right module quickly
- know what docs to read first
- know how to run validation locally
- know when a change requires contract updates
- know how to avoid hidden cross-module coupling

Module impact:

- mostly repo-level docs and templates
- touches every module indirectly by making boundaries clearer

Risks:

- contributor docs becoming stale as code evolves
- too much process without enough guidance on real engineering decisions
- issue templates that are generic instead of tailored to this architecture

Success criteria:

- contributors can quickly understand setup, scope, and validation
- docs explain how to extend the system without breaking contracts
- contribution flow is easier to follow and maintain
- outside contributors can land focused module changes without needing deep repo tribal knowledge

### Tighter README

- make the root README sharper and more product-facing
- keep the root overview concise while linking deeper docs for implementation details
- make it easier for new users to understand what the project is, what works now, and how to try it

Why this matters:

- the README is the public front door of the repository
- right now it needs to serve both contributors and people evaluating the project quickly
- a tighter README increases project clarity, adoption, and trust

Primary README goals:

- state the product clearly in a few lines
- explain what works today without overclaiming
- show the happy path quickly
- link to deeper architecture and contributor docs for implementation details

Recommended README shape for Phase 3:

1. short project description
2. what it is and what it is not
3. current supported workflow
4. quick local validation or usage path
5. project status and limitations
6. links to architecture, roadmap, contributor guide, and testing docs

Things to avoid:

- making the README a duplicate of every internal architecture doc
- mixing aspirational future-state claims with current-state behavior
- hiding limitations that affect first-time users

Success criteria:

- the README communicates the project clearly in one pass
- current capabilities and limitations are easy to find
- deeper docs are linked without overloading the front page
- a first-time visitor can understand the project in under a few minutes

## Prioritization rule

Prefer depth over breadth.

Each phase should make the current supported workflow more reliable and understandable before the project expands to much wider audio-editing scope.

When choosing between two roadmap items at the same phase, prefer the one that:

- improves the reliability of the existing editing loop,
- makes the system easier for LLMs to reason about,
- or makes project claims more measurable and honest.
