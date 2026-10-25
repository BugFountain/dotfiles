# Stacked PR reviews

Read this protocol when the subject is a stack. The [`review`](../recipes/review.md) recipe owns evidence and coverage. This file owns layer boundaries, look-ahead flags and the claim ledger.

## Detect and resolve

Treat the subject as a stack when GitHub registers one, the base-ref chain links open PRs, or the user names ordered PRs. A registered stack decides the layers: every PR in it is a layer, whoever owns it. Resolve each layer's PR, ticket, base SHA, head SHA and review order before extracting. When the user pins SHAs, use theirs.

Emit one page, with one chapter per layer, unless the user asks for separate pages.

## One changeset per layer

Order layers foundation first unless the stack defines another review order. For each layer:

1. Index that PR's own base..head (`diff-index.mjs`). Each layer's base is the head of the layer below it.
2. Measure its files and churn on their own. They match what GitHub shows for that PR.
3. Explain only what that layer changes. Code from lower layers appears as unchanged frames in the stack, tagged with the layer that introduced it.
4. Keep tests and notes scoped to that layer.
5. State later behavior as a look-ahead flag or a `later` claim, never as this layer's guarantee.

Never use the tip's cumulative diff for an ancestor chapter.

## Look-ahead flags

Each change should make sense in the PR that carries it. A flag marks a change that makes sense only through a later PR:

| Flag | Means |
| --- | --- |
| `dormant` | Code with no production caller in this layer. A feature flag that is off leaves the caller in place, so its check is a decision, not this flag. With no completing layer, the page names it dead code |
| `producer-only` | A producer (event, command, endpoint, row) whose consumer arrives in a later layer |
| `interim` | Behavior a later layer replaces or changes |
| `inverted-order` | This layer needs a later layer to work: the prerequisite sits above it |
| `outside-stack` | Depends on work outside the stack, such as another PR or ticket |

A flag names the layer that completes it (`completedBy`, or null for `outside-stack`) and its evidence as `path:line` at both ends. An extractor writes flags as `candidate`. The cross-layer pass reads the completing layer and sets each one `confirmed` or `dropped`. A lower layer's API used as intended by a higher one is ordinary layering and carries no flag.

The closing chapter lists the kept flags grouped by the layer that completes them, then the dropped candidates with the reason each was dropped.

## Claim ledger

Each chapter carries its claims: one exact behavior or contract guarantee each, marked `complete` (with the stops and test examples that support it), `later` (with the layer that completes it), or `open` (no layer in the stack completes it).

A helper without a production caller is a capability. A producer without its consumer is a produced contract. Neither is an end-to-end guarantee. A compound claim needs evidence for each guarantee, or narrower wording. The ledger is the guard against tip bleed: a lower layer's chapter never borrows a guarantee from the tip.

## The spine

The opening chapter draws the end-to-end map: every hop the stack adds, by lane (`setup`, `runtime`, `verify`), each with the layer that introduced it and its proof level. `tested` means a test reaches the hop, `assembled` that only the code exists, and `recorded` that a recorded run shows it. Node names agree across chapters, so one hop's `to` is the next hop's `from`.

A file that several layers change gets a history in the closing chapter: one sentence per layer on what that layer does to it.

## Risk evidence

When a layer introduces retries, durable state, identity boundaries, public surfaces or environment wiring, put the deciding evidence beside its claim. Name the source of record, the key or constraint, the retry and terminal branches, the expiry behavior, and the failure outcome that apply.

Use precise guarantee language such as `at most once`, `idempotent lookup`, `deduplicated write` or `best effort` only within the evidence shown. Assembly stays separate from recorded behavior.

## Done

Every chapter holds only its layer's base..head evidence, and `check.mjs` accounts for every hunk of every layer. Every flag is confirmed or dropped, with its completing layer. Every `later` claim names its completing layer, and a guarantee no layer completes reads `open`. The spine's proof levels match the evidence.
