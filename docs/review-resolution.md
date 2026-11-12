# Automated review corrections — 2026-11-12

Framework 1.0.1 corrects workflow YAML/local-action graph inspection, contained metadata/profile/test prerequisites, script MIME/module modes, base URLs, responsive resources, anchors and static imports. The snapshot includes the actual scaffolder/starters and its own locked Python profile, formatter, strict typing and regression suite. Every application's policy job now tests that implementation, including specification-only application repositories.

Secret scanning uses immutable base-revision inputs outside the candidate checkout. Custom initial bootstrap files, when present, are pinned by SHA256 in the workflow; without custom files the compiled defaults and empty fingerprint list are expected; candidate inline allow comments are disabled, and candidate policy files cannot override the base rules. The workflow/checker source itself still needs review; repository-owned CI is not independent attestation against an actor allowed to rewrite the gate.

Absent checks are explicit unavailable/N/A records, not prose commands or passing checks. JavaScript projects select the correct profile and record their bounded static-analysis migration. Existing application and data contracts remain intact.

The development-server launcher probes an actual Python 3 interpreter and supports Unix python3-only and Windows python/py installations. Launcher failure-path tests and the existing browser suite verify the behavior.

Tracked review threads addressed by these corrections:

- `PRRT_kwDOP0-p8M62dXle` — package.json
- `PRRT_kwDOP0-p8M62dXli` — .engineering/tools/audit.py
- `PRRT_kwDOP0-p8M62dXlp` — .standards.json
- `PRRT_kwDOP0-p8M62dXlx` — .standards.json

Merge/resolve only after candidate CI and relevant regression verification pass. Remaining product/operations/full-conformance gaps in docs/audit.md remain explicit; no waiver was invented.

The local security command resolves the scanner on PATH and defaults to the fetched origin/HEAD revision. CI passes an explicit immutable trusted revision and checksum-reviewed bootstrap policy. Install the pinned scanner and fetch the default branch before local scanning. The policy package uses its own locked uv environment; the application does not need PyYAML as a runtime dependency.

See [local tool setup](../.engineering/docs/local-tools.md) for exact cross-platform scanner assets, hashes and installation verification. The wrapper rejects missing/wrong scanner versions; bootstrap pins match committed Git bytes on every OS.

An actual disposable-repository negative check confirms that candidate allow-all rules, an exact candidate fingerprint ignore and an inline allow comment cannot suppress an unissued synthetic token. The check passed for ordinary and linked worktrees. Gitleaks 8.30.1 also discovers source/.gitleaksignore, so the wrapper scans the Git administrative directory from outside the candidate working tree. No real credential or external service was used. See docs/evidence/secret-gate-negative-proof.json.

Final review corrections also cover trusted revision availability and pre-push/parent selection, template owner/name substitutions, locked auditor commands, portable names, local-action resolution errors, container digest separation, import-map validation/order and mandatory-gate inclusion of existing fresh-starter verification. These are enforcement fixes under unchanged 1.0.0 controls, not additional mandatory policy requirements; 1.0.1 remains a corrective patch.

The browser check now verifies the fourth deposit through successful arcade navigation rather than reading transient homepage elements after they may already be removed. Earlier deposits retain their exact state/count assertions; application code and timing are unchanged.

This repository has no custom scanner bootstrap files; default detectors and an empty fingerprint list are intentional. No custom bootstrap detector is claimed.
