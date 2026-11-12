# Standards assessment

Overall: **not-conforming — initial adoption implemented; review and legacy gaps remain**. No approved waivers have been invented.

- Framework: 1.0.1
- Automated assessment: Codex, updated 2026-11-12; owner authorized merge; independent product/operations review remains pending
- Owner: Ballzatram
- Baseline revision: `206d3e3faed0d7919e2e91386acff30810262105`
- Profiles: typescript, web
- Risk: standard

| Control | Status | Evidence / remaining work |
| --- | --- | --- |
| AI-01 | pending | Automated changes and preservation boundaries were reviewed. Independent maintainer review remains required. |
| ARCH-01 | pass | Existing component and preservation boundaries are recorded; no new runtime service or architecture was introduced. |
| ARCH-02 | pending | Requires project-specific evidence and maintainer review. |
| BUILD-01 | pending | Requires project-specific evidence and maintainer review. |
| CI-01 | pass | Pinned PR/default/merge-group checks were exercised; successful final-head Engineering Standards CI is required before merge. See docs/merge-verification.md and the linked PR checks. |
| CI-02 | pass | Live default-branch protection was applied and read back: PR required, strict standards-gate bound to GitHub Actions, administrators enforced, force pushes/deletion denied. Solo-owner approval count is zero; deployment-environment review remains separate. |
| CODE-01 | fail | Native syntax/type checks are retained where present. Full legacy formatting and strict static-analysis adoption remain a tracked gap; no broad suppression was introduced. |
| CODE-02 | pending | Requires project-specific evidence and maintainer review. |
| DATA-01 | not-applicable | No server-side database/migration is introduced. Static assets remain versioned; browser preferences are local, not durable server data. |
| DOC-01 | pending | Requires project-specific evidence and maintainer review. |
| GOV-01 | pass | Owner, lifecycle, risk, profiles and exact policy version are declared; GitHub owner access was verified. |
| GOV-02 | pending | Requires project-specific evidence and maintainer review. |
| OPS-01 | pending | Requires project-specific evidence and maintainer review. |
| REL-01 | pending | Requires project-specific evidence and maintainer review. |
| REPO-01 | pending | Requires project-specific evidence and maintainer review. |
| REPO-02 | pass | Contribution/security guidance, owner rules and local/generated-file exclusions are present. Current committed-source scan was reviewed. |
| SEC-01 | pending | Checked-out source scan passed with narrowly reviewed false positives. CI scans full history; reporting route needs operational verification. |
| SEC-02 | pending | Executed dependency scans are listed below. Whole-project source-security coverage and triage need review; dependency scanning is not a full security audit. |
| SEC-03 | pending | Requires project-specific evidence and maintainer review. |
| TEST-01 | pending | Real regression evidence is recorded below. Review completeness against product acceptance and denied/failed behavior. |
| TEST-02 | fail | Existing projects do not yet have a source-inclusive branch-coverage ratchet satisfying the shared policy. No threshold was lowered or waiver self-approved. |
| UX-01 | pending | Requires project-specific evidence and maintainer review. |

## Executed checks and preservation

Existing static checks and 58 desktop/phone browser checks passed; two existing browser cases were skipped. npm audit reports zero known dependency vulnerabilities. The development-server command uses portable python rather than the Windows Store python3 alias. Application behavior code is unchanged.

Action references were pinned to verified commits for their existing tags; existing deployment triggers and behavior were retained. Workflow timeouts bound unattended jobs. The shared policy auditor does not execute commands from the manifest. New engineering jobs never deploy or use production credentials. Current-source scans were performed on shallow checkouts; full-history CI results must be reviewed.

## Remediation backlog

| Control | Remaining work | Owner | Target |
| --- | --- | --- | --- |
| CODE-01 | Adopt missing format/static checks in focused, tested changes | Ballzatram | Before full conformance |
| TEST-02 | Measure source/branch coverage, review critical branches and establish a ratchet | Ballzatram | Before full conformance |
| CI-01 / CI-02 | Verify candidate runs and hosted protection/environment settings | Ballzatram | Before merge |
| SEC-01 / SEC-02 | Review full-history scan, source-security scope, findings and reporting route | Ballzatram | Before merge/release |
| OPS-01 / DATA-01 / UX-01 | Complete applicable recovery, monitoring and manual accessibility reviews | Ballzatram | Before release |

Native-platform and product-specific checks that were not executed remain pending. Specification-only repositories must import real source and select its actual stack before runtime controls can be assessed.

## Merge-time evidence

See [merge verification](merge-verification.md) for measured performance, hosted enforcement, source preservation and current coverage evidence. Residual failures/pending reviews above remain explicit; merging the adoption controls is not a conformance certificate.

## Homepage scroll regression — 2026-11-12

Before the fix, the phone regression measured a 700px document in a 664px viewport and a real touch swipe moved the page by 100px. The homepage now fits the dynamic viewport, prevents pan/overscroll, and preserves pinch zoom. No page copy, elements, dependencies or application JavaScript changed. Compact portrait spacing keeps the existing controls visible.

Local verification: 7 static tests and 62 browser tests passed (4 inapplicable Chromium touch-protocol cases skipped on desktop/WebKit). Tests cover ten viewport sizes/height changes, zero scroll after a background finger swipe, subsequent coin dragging, deposits/navigation, existing routes and failure paths. The structural audit, page synchronization check and dependency audit passed. Physical iPhone/Android hardware was not used. The repository-wide formatter still reports the existing 32-file formatting gap under CODE-01; it is not waived or remediated by this functional change. Full-history secret scanning and the final Engineering Standards gate run on the committed candidate before merge.

## Mobile change standards follow-up — 2026-11-12

Scope: the homepage stylesheet and mobile regression tests from `389338a6b40ced56bebd2d0e48822a30ac0639d8`. The stylesheet is exactly Prettier's canonical formatting of that revision; no selectors, declarations, page copy, elements or application JavaScript changed. Shared typed test helpers remove repeated bounds/overlap logic. Quarter actions use accessible names; movement, cancellation, status and navigation replace CSS-class assertions. Missing DOM targets/bounding boxes fail explicitly, and the bounds check requires the expected controls to be present.

`npm run check:homepage` is required by both browser-test workflows and combines pinned formatting, recommended ESLint rules and strict TypeScript `checkJs` for the mobile test file. No rule suppressions, test retries, lowered assertions or coverage exclusions were added. This is a scoped gate, not a whole-application lint/type/coverage claim. The existing global formatter command still fails on 30 legacy files; CODE-01 and TEST-02 remain unresolved at repository scope. Strict application typing, source-inclusive branch coverage, physical devices and independent maintainer/accessibility review remain pending.

A deliberate fixed-height mutation (`760px !important`) failed the viewport test with an 84px height mismatch at 390×844; the stylesheet was restored before the clean test run. Local verification passed: frozen npm installation; `npm run check:homepage`; 7 static tests; 62 browser tests (4 inapplicable Chromium touch-protocol cases skipped); page synchronization; and the structural audit. The npm audit reports zero vulnerabilities after applying the starter's exact minimatch overrides. Full-history scanning and final-head CI remain merge requirements. No production deployment is performed as a standards check.

## Arcade responsiveness — 2026-11-12

Review follow-up preserves the older arcade entry's 800ms optional-sound deadline, starts victory preloading independently of the other sounds, retries its preparation on Drop and versions the main manifest with the game release. Stalled-audio regressions reproduced both loading problems before the fixes. The final 90-case local run before this follow-up passed 83 with 7 explicit platform skips; the expanded arcade suite and final-head CI provide the subsequent compatibility evidence.

The mobile/desktop joystick now responds at 12% travel, keeps active pointer ownership and window release/cancel recovery, caches geometry for a gesture and batches presentation writes. Keyboard overlap, lost focus, hiding and resizing are covered. Audio is predecoded in a shared interactive context with cancellable loops, bounded fetch/resume waits, a media fallback and no obsolete delayed effects. Victory audio starts loading during initialization; its MP3 derivative reduces transfer by 91.6%. Matching release versions on the entry scripts and audio/loader imports prevent stale-module API mixing. Overflow clipping prevents the reproduced 50px mobile focus pan. No copy, controls, runtime packages or game mechanics were added/changed beyond these input/audio/lifecycle fixes.

Local evidence: the original small-drag, pointer-capture-failure and overlapping-arrow checks failed before fixes. A fully paused test clock verifies actual rendered movement/reversal within two simulated frames. The full 87-case browser run passed 80 with 7 explicitly inapplicable cases skipped; the subsequently added focus-pan regression passed in all three projects. Seven static tests and twelve audio/budget tests passed, as did scoped formatting/ESLint/strict checkJs, page synchronization, the structural audit and dependency audit (zero known vulnerabilities). Final-head/full-matrix CI and full-history scanning remain required before merge; CI links provide the committed-candidate evidence.

The audio module now has a 90% source-inclusive line/branch/function gate: measured 94.93% lines, 92.52% branches and 93.55% functions. The four initial sounds total 990,224 bytes against a 1 MB budget. These are scoped results: the global formatter still reports 28 legacy files, and whole-application strict typing/branch coverage and independent maintainer/accessibility/physical-device review remain unresolved. Windows Playwright WebKit exposes no AudioContext, so the two Web Audio probes are skipped locally; its input/visual tests and the unit-tested media fallback remain covered. Physical speaker/Bluetooth latency was not measured. See [arcade responsiveness](arcade-responsiveness.md) for asset provenance, budgets and limits.
