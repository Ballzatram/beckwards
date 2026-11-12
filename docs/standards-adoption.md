# Engineering standards adoption

Owner: Ballzatram. Policy: 1.0.0. Baseline source revision: `206d3e3faed0d7919e2e91386acff30810262105`.

Static music site with generated route copies, browser interactions and a claw-machine game. Existing static and Playwright tests remain authoritative.

## Verification

Run `python .engineering/tools/audit.py .` for structural prerequisites. Existing native test/build commands are retained in README and the workflows. `.github/workflows/engineering.yml` adds a consistent, read-only verification gate; it never deploys or uses production secrets. Review `docs/audit.md` for controls requiring manual evidence.

The command register includes existing syntax/compile checks where no full static type checker exists; these are not equivalent to strict typing. Legacy formatter/type/coverage gaps remain explicit, not silently waived. No approved exceptions have been invented. Source import/native platform requirements and hosted protections must be reviewed separately.

## Preservation

Default branches and deployed services are not changed by preparing this branch. Runtime source changes, if any, are limited to documented regression fixes and must pass the existing tests. Do not run live research, mail, payment, model generation, customer data changes or production deployment as a standards check.

## Recorded local verification

Existing static checks and 58 desktop/phone browser checks passed; two existing browser cases were skipped. npm audit reports zero known dependency vulnerabilities. The development-server command uses portable python rather than the Windows Store python3 alias. Application behavior code is unchanged.

See docs/audit.md for unresolved controls. A structural pass is not full conformance.
