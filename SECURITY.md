# Security

## Status

OrbitalDEX is deployed on **Stellar Testnet only**. It has not had a
third-party security audit — `auditreport.md` in this repo is a self-review
(adversarial-mode, all findings' fixes verified in code), which is a useful
first pass but is not a substitute for independent review. Per that report's
own Mainnet Readiness Checklist, a third-party audit is a **P0 blocker**
before any mainnet deployment. Do not deploy this to mainnet, or point it at
real funds, without one.

## Reporting a vulnerability

Please use [GitHub Security
Advisories](https://github.com/ritikadebnath009/Orbital/security/advisories/new)
for this repo rather than opening a public issue, so a fix can land before
details are public. Since this is currently a testnet-only project with no
real funds at risk, non-critical findings (gas/efficiency, testnet-only
issues) are fine as regular issues.

## Admin keys and upgrade governance

- **Never commit private keys or `.env`/`.env.local` files.** CRIT-4 in the
  audit was exactly this — both were committed at one point; the deploy
  script now verifies `.gitignore` coverage before writing secrets, and both
  files are gitignored. If you're rotating the deployer key, generate a new
  one with `stellar keys generate` — don't reuse a key that was ever
  committed.
- **Contract upgrades are two-phase and timelocked.** `propose_upgrade(hash)`
  starts a 48-hour window; `execute_upgrade()` only succeeds after it
  elapses, and `cancel_upgrade()` aborts a pending proposal at any time
  (admin-only). This means a compromised admin key can't replace running
  WASM instantly — there's a 48-hour window for the community/team to notice
  an unexpected proposal (via `get_pending_upgrade()`) and react, e.g. by
  moving funds or coordinating a response. **Check `get_pending_upgrade()`
  on each pool/factory periodically** — nothing currently pages anyone when
  a proposal is created.
- **Admin transfer is two-step** (`propose_admin` / `accept_admin`) so a
  typo'd address can't permanently brick admin control (MED-5).
- A pending upgrade from this project's own audit-followup work is recorded
  in `deployment.json` → `pending_upgrades` and `CHANGELOG.md` — check there
  before assuming no upgrade is in flight on the live testnet pools.

## Emergency response

`PoolFactory.pause_all()` pauses every registered pool in one call and
returns the addresses of any that failed to pause (rather than one bad pool
silently blocking the rest — see the `test_pause_all_reports_only_the_broken_pool`
test). Individual pools can also be paused directly via `set_paused(true)`.
There is no automated circuit breaker (e.g. oracle-based depeg detection) —
pausing is a manual admin action.

## Scope notes for reviewers

- StableSwap math (`contracts/stable_pool/src/math.rs`) is the highest-value
  area to review — it's the part where a subtle bug has direct financial
  impact on LPs and traders. `auditreport.md` documents the overflow
  (CRIT-2) and precision (HIGH-1) issues already found and fixed there.
- The router (`contracts/router/src/lib.rs`) never custodies funds — every
  transfer is `token.transfer(user, pool, amount)` or the reverse, directly
  between the user and whichever pool is executing a hop, authorized once by
  the user's `require_auth()` at the top of `swap()`.
- Backend/indexer issues are lower severity by construction: it's a
  read-only mirror of on-chain state for analytics, not part of the
  trust-critical path for funds.
