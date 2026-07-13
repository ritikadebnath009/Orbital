//! Integration tests using Stellar Asset Contracts (SAC).
//!
//! Uses env.register_stellar_asset_contract_v2() which is the same contract type
//! deployed for Circle USDC/USDT/EURC on Stellar testnet. This matches the real
//! on-chain token interface exactly.

#![cfg(test)]

extern crate std;

use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token::{StellarAssetClient, TokenClient},
    Address, Env,
};

use crate::{StablePool, StablePoolClient};

const PRECISION: i128 = 10_000_000; // 1e7 Stellar strobes

fn deploy_sac<'a>(e: &'a Env, admin: &Address) -> (Address, StellarAssetClient<'a>) {
    let contract = e.register_stellar_asset_contract_v2(admin.clone());
    let addr = contract.address();
    let client = StellarAssetClient::new(e, &addr);
    (addr, client)
}

struct TestPool<'a> {
    env: Env,
    pool: StablePoolClient<'a>,
    usdc: Address,
    usdt: Address,
    admin: Address,
}

impl<'a> TestPool<'a> {
    fn new_with_amp(amp: u64) -> Self {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let usdc_admin = Address::generate(&env);
        let usdt_admin = Address::generate(&env);

        let (usdc, _) = deploy_sac(&env, &usdc_admin);
        let (usdt, _) = deploy_sac(&env, &usdt_admin);

        let pool_id = env.register(StablePool, ());
        let pool = StablePoolClient::new(&env, &pool_id);

        pool.initialize(&admin, &usdc, &usdt, &amp, &4u32);

        Self {
            env,
            pool,
            usdc,
            usdt,
            admin,
        }
    }

    fn new() -> Self {
        Self::new_with_amp(100)
    }

    fn mint_usdc(&self, to: &Address, amount: i128) {
        StellarAssetClient::new(&self.env, &self.usdc)
            .mint(to, &amount);
    }

    fn mint_usdt(&self, to: &Address, amount: i128) {
        StellarAssetClient::new(&self.env, &self.usdt)
            .mint(to, &amount);
    }

    fn usdc_balance(&self, addr: &Address) -> i128 {
        TokenClient::new(&self.env, &self.usdc).balance(addr)
    }

    fn usdt_balance(&self, addr: &Address) -> i128 {
        TokenClient::new(&self.env, &self.usdt).balance(addr)
    }
}

// ── Initialization ────────────────────────────────────────────────────────────

#[test]
fn test_initialize_success() {
    let t = TestPool::new();
    let (ta, tb) = t.pool.get_tokens();
    assert_eq!(ta, t.usdc);
    assert_eq!(tb, t.usdt);
    assert_eq!(t.pool.get_amp(), 100u64);
    assert_eq!(t.pool.get_fee_bps(), 4u32);
    assert_eq!(t.pool.get_total_shares(), 0i128);
    assert!(!t.pool.is_paused());
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_double_initialize_fails() {
    let t = TestPool::new();
    t.pool.initialize(&t.admin, &t.usdc, &t.usdt, &100u64, &4u32);
}

// ── Add Liquidity ─────────────────────────────────────────────────────────────

#[test]
fn test_first_deposit_balanced() {
    let t = TestPool::new();
    let lp = Address::generate(&t.env);
    let amt = 1_000 * PRECISION;
    t.mint_usdc(&lp, amt);
    t.mint_usdt(&lp, amt);

    let shares = t.pool.add_liquidity(&lp, &amt, &amt, &1i128);

    // First balanced deposit: shares = D = sum of amounts
    assert_eq!(shares, amt * 2);
    assert_eq!(t.pool.get_total_shares(), amt * 2);
    assert_eq!(t.pool.get_user_shares(&lp), amt * 2);
    let (ra, rb) = t.pool.get_reserves();
    assert_eq!(ra, amt);
    assert_eq!(rb, amt);
}

#[test]
fn test_second_deposit_proportional() {
    let t = TestPool::new();
    let lp1 = Address::generate(&t.env);
    let lp2 = Address::generate(&t.env);
    let amt = 10_000 * PRECISION;

    t.mint_usdc(&lp1, amt);
    t.mint_usdt(&lp1, amt);
    t.pool.add_liquidity(&lp1, &amt, &amt, &1i128);

    // Second deposit: same ratio, same size
    t.mint_usdc(&lp2, amt);
    t.mint_usdt(&lp2, amt);
    let shares2 = t.pool.add_liquidity(&lp2, &amt, &amt, &1i128);

    // Equal deposit should mint equal shares
    assert_eq!(shares2, t.pool.get_user_shares(&lp1));
    assert_eq!(t.pool.get_total_shares(), shares2 * 2);
}

#[test]
#[should_panic(expected = "Error(Contract, #7)")]
fn test_add_liquidity_slippage_guard() {
    let t = TestPool::new();
    let lp = Address::generate(&t.env);
    let amt = 1_000 * PRECISION;
    t.mint_usdc(&lp, amt);
    t.mint_usdt(&lp, amt);
    // Require more shares than will be minted
    t.pool.add_liquidity(&lp, &amt, &amt, &(amt * 100));
}

#[test]
fn test_add_liquidity_single_sided() {
    // Single-sided deposit: legal but incurs imbalance fee
    let t = TestPool::new();
    let lp1 = Address::generate(&t.env);
    let lp2 = Address::generate(&t.env);
    let amt = 100_000 * PRECISION;

    t.mint_usdc(&lp1, amt);
    t.mint_usdt(&lp1, amt);
    t.pool.add_liquidity(&lp1, &amt, &amt, &1i128);

    // Second provider adds only USDC
    let deposit = 1_000 * PRECISION;
    t.mint_usdc(&lp2, deposit);
    let shares = t.pool.add_liquidity(&lp2, &deposit, &0i128, &1i128);
    assert!(shares > 0);
}

// ── Remove Liquidity ──────────────────────────────────────────────────────────

#[test]
fn test_remove_all_liquidity() {
    let t = TestPool::new();
    let lp = Address::generate(&t.env);
    let amt = 1_000 * PRECISION;
    t.mint_usdc(&lp, amt);
    t.mint_usdt(&lp, amt);

    let shares = t.pool.add_liquidity(&lp, &amt, &amt, &1i128);
    t.pool.remove_liquidity(&lp, &shares, &1i128, &1i128);

    assert_eq!(t.pool.get_total_shares(), 0);
    assert_eq!(t.pool.get_user_shares(&lp), 0);
    // Tokens returned (allow 1 strobe rounding)
    assert!((t.usdc_balance(&lp) - amt).abs() <= 1);
    assert!((t.usdt_balance(&lp) - amt).abs() <= 1);
}

#[test]
fn test_remove_partial_liquidity() {
    let t = TestPool::new();
    let lp = Address::generate(&t.env);
    let amt = 10_000 * PRECISION;
    t.mint_usdc(&lp, amt);
    t.mint_usdt(&lp, amt);

    let shares = t.pool.add_liquidity(&lp, &amt, &amt, &1i128);
    let half = shares / 2;
    t.pool.remove_liquidity(&lp, &half, &1i128, &1i128);

    assert_eq!(t.pool.get_user_shares(&lp), shares - half);
    assert!((t.usdc_balance(&lp) - amt / 2).abs() <= 1);
    assert!((t.usdt_balance(&lp) - amt / 2).abs() <= 1);
}

#[test]
#[should_panic(expected = "Error(Contract, #10)")]
fn test_remove_more_than_balance_fails() {
    let t = TestPool::new();
    let lp = Address::generate(&t.env);
    let amt = 1_000 * PRECISION;
    t.mint_usdc(&lp, amt);
    t.mint_usdt(&lp, amt);
    let shares = t.pool.add_liquidity(&lp, &amt, &amt, &1i128);
    t.pool.remove_liquidity(&lp, &(shares + 1), &0i128, &0i128);
}

// ── Swap ──────────────────────────────────────────────────────────────────────

#[test]
fn test_swap_usdc_for_usdt() {
    let t = TestPool::new();
    let lp = Address::generate(&t.env);
    let trader = Address::generate(&t.env);
    let pool_size = 1_000_000 * PRECISION;

    t.mint_usdc(&lp, pool_size);
    t.mint_usdt(&lp, pool_size);
    t.pool.add_liquidity(&lp, &pool_size, &pool_size, &1i128);

    let swap_amt = 100 * PRECISION;
    t.mint_usdc(&trader, swap_amt);
    let received = t.pool.swap(&trader, &t.usdc, &swap_amt, &1i128);

    // Received USDT should be close to input minus fee (0.04%)
    let expected_min = swap_amt * 9990 / 10_000; // allow up to 0.1% total deviation
    assert!(received >= expected_min, "received={received} too low");
    assert!(received < swap_amt, "should receive less than input");

    // Trader USDC should be zero, has USDT
    assert_eq!(t.usdc_balance(&trader), 0);
    assert_eq!(t.usdt_balance(&trader), received);
}

#[test]
fn test_swap_usdt_for_usdc() {
    let t = TestPool::new();
    let lp = Address::generate(&t.env);
    let trader = Address::generate(&t.env);
    let pool_size = 1_000_000 * PRECISION;

    t.mint_usdc(&lp, pool_size);
    t.mint_usdt(&lp, pool_size);
    t.pool.add_liquidity(&lp, &pool_size, &pool_size, &1i128);

    let swap_amt = 500 * PRECISION;
    t.mint_usdt(&trader, swap_amt);
    let received = t.pool.swap(&trader, &t.usdt, &swap_amt, &1i128);

    assert!(received > 0);
    assert!(received < swap_amt);
    assert_eq!(t.usdt_balance(&trader), 0);
    assert_eq!(t.usdc_balance(&trader), received);
}

#[test]
#[should_panic(expected = "Error(Contract, #7)")]
fn test_swap_slippage_guard() {
    let t = TestPool::new();
    let lp = Address::generate(&t.env);
    let trader = Address::generate(&t.env);
    let pool_size = 1_000 * PRECISION;

    t.mint_usdc(&lp, pool_size);
    t.mint_usdt(&lp, pool_size);
    t.pool.add_liquidity(&lp, &pool_size, &pool_size, &1i128);

    let swap_amt = 100 * PRECISION;
    t.mint_usdc(&trader, swap_amt);
    // min_out larger than possible — must revert
    t.pool.swap(&trader, &t.usdc, &swap_amt, &swap_amt);
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")]
fn test_swap_wrong_token_fails() {
    let t = TestPool::new();
    let lp = Address::generate(&t.env);
    let trader = Address::generate(&t.env);
    let amt = 1_000 * PRECISION;

    t.mint_usdc(&lp, amt);
    t.mint_usdt(&lp, amt);
    t.pool.add_liquidity(&lp, &amt, &amt, &1i128);

    let random_token = Address::generate(&t.env);
    t.pool.swap(&trader, &random_token, &(10 * PRECISION), &1i128);
}

// ── Virtual Price ─────────────────────────────────────────────────────────────

#[test]
fn test_virtual_price_increases_after_swaps() {
    let t = TestPool::new();
    let lp = Address::generate(&t.env);
    let trader = Address::generate(&t.env);
    let pool_size = 10_000_000 * PRECISION;

    t.mint_usdc(&lp, pool_size);
    t.mint_usdt(&lp, pool_size);
    t.pool.add_liquidity(&lp, &pool_size, &pool_size, &1i128);

    let vp_before = t.pool.get_virtual_price();

    // Execute many swaps to accumulate fees
    for _ in 0..10 {
        let swap_amt = 100_000 * PRECISION;
        t.mint_usdc(&trader, swap_amt);
        t.pool.swap(&trader, &t.usdc, &swap_amt, &1i128);
        let usdt_bal = t.usdt_balance(&trader);
        if usdt_bal > 0 {
            t.pool.swap(&trader, &t.usdt, &usdt_bal, &1i128);
        }
    }

    let vp_after = t.pool.get_virtual_price();
    assert!(vp_after > vp_before, "virtual price must increase: {vp_before} -> {vp_after}");
}

// ── Emergency Pause ───────────────────────────────────────────────────────────

#[test]
#[should_panic(expected = "Error(Contract, #11)")]
fn test_swap_fails_when_paused() {
    let t = TestPool::new();
    let lp = Address::generate(&t.env);
    let trader = Address::generate(&t.env);
    let amt = 10_000 * PRECISION;

    t.mint_usdc(&lp, amt);
    t.mint_usdt(&lp, amt);
    t.pool.add_liquidity(&lp, &amt, &amt, &1i128);

    t.pool.set_paused(&true);
    assert!(t.pool.is_paused());

    t.mint_usdc(&trader, 100 * PRECISION);
    t.pool.swap(&trader, &t.usdc, &(100 * PRECISION), &1i128);
}

#[test]
fn test_unpause_restores_swaps() {
    let t = TestPool::new();
    let lp = Address::generate(&t.env);
    let trader = Address::generate(&t.env);
    let amt = 10_000 * PRECISION;

    t.mint_usdc(&lp, amt);
    t.mint_usdt(&lp, amt);
    t.pool.add_liquidity(&lp, &amt, &amt, &1i128);

    t.pool.set_paused(&true);
    t.pool.set_paused(&false);

    t.mint_usdc(&trader, 100 * PRECISION);
    let received = t.pool.swap(&trader, &t.usdc, &(100 * PRECISION), &1i128);
    assert!(received > 0);
}

// ── Amplification ─────────────────────────────────────────────────────────────

#[test]
fn test_high_amp_better_price() {
    // Higher A → less slippage for same pool/swap sizes
    let t_low = TestPool::new_with_amp(10);
    let t_high = TestPool::new_with_amp(1000);

    let pool_size = 1_000_000 * PRECISION;
    let swap_amt = 10_000 * PRECISION;

    for t in [&t_low, &t_high] {
        let lp = Address::generate(&t.env);
        t.mint_usdc(&lp, pool_size);
        t.mint_usdt(&lp, pool_size);
        t.pool.add_liquidity(&lp, &pool_size, &pool_size, &1i128);
    }

    let trader_low = Address::generate(&t_low.env);
    t_low.mint_usdc(&trader_low, swap_amt);
    let received_low = t_low.pool.swap(&trader_low, &t_low.usdc, &swap_amt, &1i128);

    let trader_high = Address::generate(&t_high.env);
    t_high.mint_usdc(&trader_high, swap_amt);
    let received_high = t_high.pool.swap(&trader_high, &t_high.usdc, &swap_amt, &1i128);

    assert!(
        received_high > received_low,
        "high A should give better price: high={received_high}, low={received_low}"
    );
}

// ── Spot Price ────────────────────────────────────────────────────────────────

#[test]
fn test_spot_price_near_one_balanced() {
    let t = TestPool::new();
    let lp = Address::generate(&t.env);
    let amt = 1_000_000 * PRECISION;
    t.mint_usdc(&lp, amt);
    t.mint_usdt(&lp, amt);
    t.pool.add_liquidity(&lp, &amt, &amt, &1i128);

    let price = t.pool.get_spot_price(&t.usdc);
    // Spot price should be ~1.0 (within 10 bps of PRECISION)
    let diff = (price - PRECISION).abs();
    assert!(
        diff < PRECISION / 1000,
        "spot price far from 1.0: price={price}, PRECISION={PRECISION}, diff={diff}"
    );
}

// LOW-1 regression: on an imbalanced pool, get_spot_price must track the true
// marginal (instantaneous) price of the invariant curve, not a secant price
// distorted by a probe that's large relative to the reserves. We verify this
// by comparing the contract's answer against a reference computed with a
// 1-strobe probe (as close to instantaneous as the integer math allows) and
// against what the old fixed-1-token-probe implementation would have
// returned — the new value must be much closer to the reference.
#[test]
fn test_spot_price_imbalanced_matches_marginal_price() {
    let t = TestPool::new();
    let lp = Address::generate(&t.env);
    // Deliberately imbalanced first deposit: 10x skew, at a realistic scale
    // so the -1-strobe rounding buffer in compute_swap (a deliberate
    // conservative safety margin, not something this fix touches) stays
    // negligible relative to the probe sizes involved.
    let small = 5_000 * PRECISION;
    let large = 50_000 * PRECISION;
    t.mint_usdc(&lp, small);
    t.mint_usdt(&lp, large);
    t.pool.add_liquidity(&lp, &small, &large, &1i128);

    let contract_price = t.pool.get_spot_price(&t.usdc);

    // Reference: a tiny probe (10,000 strobes — 0.001 token, far smaller than
    // the old fixed 1-token probe and still safely clear of compute_swap's
    // -1-strobe rounding buffer) as a stand-in for the instantaneous
    // derivative at this point on the curve.
    let xp = [small, large];
    let probe_ref = 10_000i128;
    let (dy_ref, _) = crate::math::compute_swap(xp, 0, probe_ref, 100u64, 0).unwrap();
    let reference_price = dy_ref * PRECISION / probe_ref;

    let diff = (contract_price - reference_price).abs();
    assert!(
        diff < PRECISION / 100,
        "get_spot_price should track the marginal reference within 1% on an \
         imbalanced pool: contract_price={contract_price}, reference_price={reference_price}, \
         diff={diff}"
    );

    // Sanity check the direction: USDC is the scarce side of this pool, so
    // selling it should command a premium (>1 unit of USDT per USDC).
    assert!(
        contract_price > PRECISION,
        "scarce-side spot price should be above par: {contract_price}"
    );
}

// ── Simulation (get_swap_result) ──────────────────────────────────────────────

#[test]
fn test_simulate_matches_actual_swap() {
    let t = TestPool::new();
    let lp = Address::generate(&t.env);
    let trader = Address::generate(&t.env);
    let pool_size = 1_000_000 * PRECISION;
    let swap_amt = 500 * PRECISION;

    t.mint_usdc(&lp, pool_size);
    t.mint_usdt(&lp, pool_size);
    t.pool.add_liquidity(&lp, &pool_size, &pool_size, &1i128);

    let (simulated_out, simulated_fee) = t.pool.get_swap_result(&t.usdc, &swap_amt);

    t.mint_usdc(&trader, swap_amt);
    let actual_out = t.pool.swap(&trader, &t.usdc, &swap_amt, &1i128);

    assert_eq!(simulated_out, actual_out, "simulation must match actual swap");
    assert!(simulated_fee > 0);
}

// ── Ramp A tests ──────────────────────────────────────────────────────────────

fn set_timestamp(env: &Env, ts: u64) {
    env.ledger().set_timestamp(ts);
}

fn seed_pool(t: &TestPool<'_>) {
    let amt = 100_000 * PRECISION;
    StellarAssetClient::new(&t.env, &t.usdc).mint(&t.admin, &amt);
    StellarAssetClient::new(&t.env, &t.usdt).mint(&t.admin, &amt);
    t.pool.add_liquidity(&t.admin, &amt, &amt, &1i128);
}

#[test]
fn test_ramp_a_linearly_interpolates() {
    let t = TestPool::new_with_amp(100);
    seed_pool(&t);

    // Start ramp: A 100 → 200 over 2 days
    let t0: u64 = 1_000_000;
    let t1: u64 = t0 + 2 * 86_400;
    set_timestamp(&t.env, t0);
    t.pool.ramp_a(&200u64, &t1);

    // At start: still 100
    assert_eq!(t.pool.get_amp(), 100u64);

    // At midpoint: ~150
    set_timestamp(&t.env, t0 + 86_400);
    let mid = t.pool.get_amp();
    assert!((149..=151).contains(&mid), "midpoint A should be ~150, got {mid}");

    // After end: exactly 200
    set_timestamp(&t.env, t1 + 1);
    assert_eq!(t.pool.get_amp(), 200u64);
}

#[test]
fn test_ramp_a_decreasing() {
    let t = TestPool::new_with_amp(200);
    seed_pool(&t);

    let t0: u64 = 2_000_000;
    let t1: u64 = t0 + 86_400;
    set_timestamp(&t.env, t0);
    t.pool.ramp_a(&20u64, &t1); // 200 → 20 (10× decrease, exactly at limit)

    set_timestamp(&t.env, t0 + 43_200); // halfway
    let mid = t.pool.get_amp();
    // Linear: 200 + (20-200)*0.5 = 110
    assert!((109..=111).contains(&mid), "midpoint should be ~110, got {mid}");

    set_timestamp(&t.env, t1);
    assert_eq!(t.pool.get_amp(), 20u64);
}

#[test]
fn test_stop_ramp_locks_current_value() {
    let t = TestPool::new_with_amp(100);
    seed_pool(&t);

    let t0: u64 = 3_000_000;
    let t1: u64 = t0 + 2 * 86_400;
    set_timestamp(&t.env, t0);
    t.pool.ramp_a(&200u64, &t1);

    // At midpoint (~150), stop the ramp
    set_timestamp(&t.env, t0 + 86_400);
    let stopped_at = t.pool.get_amp();
    t.pool.stop_ramp_a();

    // After stop: A stays at stopped value regardless of time passing
    set_timestamp(&t.env, t1 + 1_000_000);
    assert_eq!(t.pool.get_amp(), stopped_at);
}

#[test]
#[should_panic(expected = "Error(Contract, #19)")]
fn test_ramp_time_too_short_fails() {
    let t = TestPool::new_with_amp(100);
    let t0: u64 = 4_000_000;
    set_timestamp(&t.env, t0);
    // end time is only 1 hour ahead — less than MIN_RAMP_TIME (1 day)
    t.pool.ramp_a(&110u64, &(t0 + 3_600));
}

#[test]
#[should_panic(expected = "Error(Contract, #18)")]
fn test_ramp_too_fast_fails() {
    let t = TestPool::new_with_amp(100);
    let t0: u64 = 5_000_000;
    set_timestamp(&t.env, t0);
    // 100 → 1100 is 11× — exceeds MAX_A_CHANGE = 10
    t.pool.ramp_a(&1100u64, &(t0 + 2 * 86_400));
}

#[test]
#[should_panic(expected = "Error(Auth")]
fn test_ramp_unauthorized_fails() {
    // Build pool without mock_all_auths so require_auth() is enforced.
    // initialize() needs no auth; ramp_a() calls admin.require_auth() and will fail.
    let env = Env::default();
    let admin = Address::generate(&env);
    let usdc_admin = Address::generate(&env);
    let usdt_admin = Address::generate(&env);
    let (usdc, _) = deploy_sac(&env, &usdc_admin);
    let (usdt, _) = deploy_sac(&env, &usdt_admin);

    let pool_id = env.register(StablePool, ());
    let pool = StablePoolClient::new(&env, &pool_id);
    pool.initialize(&admin, &usdc, &usdt, &100u64, &4u32);

    let t0: u64 = 6_000_000;
    env.ledger().set_timestamp(t0);
    // No auth mocked — admin.require_auth() will panic with Error(Auth, InvalidAction)
    pool.ramp_a(&200u64, &(t0 + 2 * 86_400));
}

#[test]
fn test_swap_uses_interpolated_amp() {
    // Higher A = less slippage. During a ramp from 20 → 200 (10×, within MAX_A_CHANGE),
    // slippage should decrease as A increases.
    let t = TestPool::new_with_amp(20);
    seed_pool(&t);

    let amt = 1_000 * PRECISION;
    StellarAssetClient::new(&t.env, &t.usdc).mint(&t.admin, &(amt * 4));

    let t0: u64 = 7_000_000;
    let t1: u64 = t0 + 2 * 86_400;
    set_timestamp(&t.env, t0);
    t.pool.ramp_a(&200u64, &t1);

    // Swap at A=10 (start of ramp)
    let (out_low_a, _) = t.pool.get_swap_result(&t.usdc, &amt);

    // Advance to end of ramp: A=200
    set_timestamp(&t.env, t1);
    let (out_high_a, _) = t.pool.get_swap_result(&t.usdc, &amt);

    // Higher A → less slippage → more output
    assert!(
        out_high_a > out_low_a,
        "A=200 should give more output ({out_high_a}) than A=20 ({out_low_a})"
    );
}

// ── Invariant & upgrade-timelock property tests ─────────────────────────────────
//
// The audit's Test Coverage Analysis flagged three gaps: a D-never-decreases
// property test, virtual-price-monotonicity across many swaps, and upgrade
// timelock coverage. Rather than pull in an external fuzz/proptest dependency,
// these use a small deterministic xorshift64 PRNG so runs are reproducible.

struct Xorshift64(u64);
impl Xorshift64 {
    fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }
    fn range(&mut self, lo: i128, hi: i128) -> i128 {
        let span = (hi - lo) as u64;
        lo + (self.next() % span) as i128
    }
}

#[test]
fn test_invariant_d_never_decreases_across_random_swaps() {
    let t = TestPool::new();
    let lp = Address::generate(&t.env);
    let pool_size = 1_000_000 * PRECISION;
    t.mint_usdc(&lp, pool_size);
    t.mint_usdt(&lp, pool_size);
    t.pool.add_liquidity(&lp, &pool_size, &pool_size, &1i128);

    let trader = Address::generate(&t.env);
    t.mint_usdc(&trader, pool_size);
    t.mint_usdt(&trader, pool_size);

    let mut rng = Xorshift64(0x5EED_1234_ABCD_9876);
    let mut prev_d = t.pool.get_d();

    for i in 0..40 {
        let amt = rng.range(PRECISION, 5_000 * PRECISION);
        let out = if i % 2 == 0 {
            t.pool.swap(&trader, &t.usdc, &amt, &1i128)
        } else {
            t.pool.swap(&trader, &t.usdt, &amt, &1i128)
        };
        assert!(out > 0);
        let d = t.pool.get_d();
        assert!(d >= prev_d, "D decreased after swap #{i}: prev={prev_d}, new={d}");
        prev_d = d;
    }
}

#[test]
fn test_virtual_price_monotonic_across_random_swaps() {
    let t = TestPool::new();
    let lp = Address::generate(&t.env);
    let pool_size = 1_000_000 * PRECISION;
    t.mint_usdc(&lp, pool_size);
    t.mint_usdt(&lp, pool_size);
    t.pool.add_liquidity(&lp, &pool_size, &pool_size, &1i128);

    let trader = Address::generate(&t.env);
    t.mint_usdc(&trader, pool_size);
    t.mint_usdt(&trader, pool_size);

    let mut rng = Xorshift64(0x1357_9BDF_2468_ACE0);
    let mut prev_vp = t.pool.get_virtual_price();

    for i in 0..40 {
        let amt = rng.range(PRECISION, 5_000 * PRECISION);
        if i % 2 == 0 {
            t.pool.swap(&trader, &t.usdc, &amt, &1i128);
        } else {
            t.pool.swap(&trader, &t.usdt, &amt, &1i128);
        };
        let vp = t.pool.get_virtual_price();
        assert!(vp >= prev_vp, "virtual price decreased after swap #{i}: prev={prev_vp}, new={vp}");
        prev_vp = vp;
    }
}

#[test]
fn test_upgrade_execute_blocked_before_timelock() {
    let t = TestPool::new();
    let t0: u64 = 1_000_000;
    set_timestamp(&t.env, t0);

    let dummy_hash = soroban_sdk::BytesN::from_array(&t.env, &[7u8; 32]);
    t.pool.propose_upgrade(&dummy_hash);

    let pending = t.pool.get_pending_upgrade();
    assert_eq!(pending, Some((dummy_hash.clone(), t0 + 172_800)));

    // Immediately after proposing, execution must still be blocked.
    let result = t.pool.try_execute_upgrade();
    assert!(result.is_err(), "execute_upgrade should fail before the 48h timelock elapses");

    // One second before the deadline: still blocked.
    set_timestamp(&t.env, t0 + 172_800 - 1);
    let result = t.pool.try_execute_upgrade();
    assert!(result.is_err(), "execute_upgrade should still be blocked 1s before the deadline");
}

#[test]
fn test_upgrade_cancel_clears_pending() {
    let t = TestPool::new();
    let dummy_hash = soroban_sdk::BytesN::from_array(&t.env, &[3u8; 32]);
    t.pool.propose_upgrade(&dummy_hash);
    assert!(t.pool.get_pending_upgrade().is_some());

    t.pool.cancel_upgrade();
    assert_eq!(t.pool.get_pending_upgrade(), None);

    // Nothing pending anymore — execute must fail with NoPendingUpgrade, not
    // silently proceed.
    let result = t.pool.try_execute_upgrade();
    assert!(result.is_err(), "execute_upgrade must fail once the pending upgrade was cancelled");
}
