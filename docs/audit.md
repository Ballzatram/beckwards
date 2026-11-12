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
