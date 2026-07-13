//! End-to-end LP profit flow tests.
//!
//! Tests the full liquidity-provider lifecycle:
//!   deposit → swaps generate fees → fees accumulate in reserves →
//!   LP withdraws MORE than deposited → verifiable on-chain profit.
//!
//! Every assertion is expressed in concrete strobe amounts so there is no
//! ambiguity about whether profit actually occurred.

#![cfg(test)]

extern crate std;
use std::println;

use soroban_sdk::{
    testutils::Address as _,
    token::{StellarAssetClient, TokenClient},
    Address, Env,
};

use crate::{StablePool, StablePoolClient};

const PRECISION: i128 = 10_000_000; // 1e7 strobes = 1 token

// ── Test harness ──────────────────────────────────────────────────────────────

struct Pool<'a> {
    env: Env,
    pool: StablePoolClient<'a>,
    usdc: Address,
    xlm: Address,
}

impl<'a> Pool<'a> {
    fn new() -> Self {
        let env = Env::default();
        env.mock_all_auths_allowing_non_root_auth();

        let admin = Address::generate(&env);
        let usdc_admin = Address::generate(&env);
        let xlm_admin = Address::generate(&env);

        let usdc_sac = env.register_stellar_asset_contract_v2(usdc_admin.clone());
        let xlm_sac = env.register_stellar_asset_contract_v2(xlm_admin.clone());
        let usdc = usdc_sac.address();
        let xlm = xlm_sac.address();

        let pool_id = env.register(StablePool, ());
        let pool = StablePoolClient::new(&env, &pool_id);
        pool.initialize(&admin, &usdc, &xlm, &100u64, &4u32); // A=100, fee=4bps

        Self { env, pool, usdc, xlm }
    }

    fn mint_usdc(&self, to: &Address, amount: i128) {
        StellarAssetClient::new(&self.env, &self.usdc).mint(to, &amount);
    }

    fn mint_xlm(&self, to: &Address, amount: i128) {
        StellarAssetClient::new(&self.env, &self.xlm).mint(to, &amount);
    }

    fn usdc_balance(&self, addr: &Address) -> i128 {
        TokenClient::new(&self.env, &self.usdc).balance(addr)
    }

    fn xlm_balance(&self, addr: &Address) -> i128 {
        TokenClient::new(&self.env, &self.xlm).balance(addr)
    }

    fn user_value(&self, addr: &Address) -> i128 {
        self.usdc_balance(addr) + self.xlm_balance(addr)
    }

    /// Value of user's LP position at current reserves (USDC + XLM combined).
    fn lp_position_value(&self, addr: &Address) -> i128 {
        let shares = self.pool.get_user_shares(addr);
        let total = self.pool.get_total_shares();
        if total == 0 { return 0; }
        let (ra, rb) = self.pool.get_reserves();
        let a = (shares * ra) / total;
        let b = (shares * rb) / total;
        a + b
    }

    /// Execute N round-trip swaps (USDC→XLM then XLM→USDC) with a fresh trader
    /// each time so the pool always has a net balanced state while fees accumulate.
    fn run_swaps(&self, n: u32, swap_usdc: i128) {
        for _ in 0..n {
            let trader = Address::generate(&self.env);
            self.mint_usdc(&trader, swap_usdc);

            // USDC → XLM
            let xlm_out = self.pool.swap(&trader, &self.usdc, &swap_usdc, &1i128);

            // XLM → USDC (return trip, slightly less due to fees)
            let usdc_out = self.pool.swap(&trader, &self.xlm, &xlm_out, &1i128);

            // Trader ends with a tiny USDC deficit — the rest stayed in the pool as fees
            let _ = usdc_out; // fees are captured, trader absorbed the cost
        }
    }
}

// ── Test 1: Single LP earns real profit from swap fees ─────────────────────────

#[test]
fn test_lp_earns_profit_from_fees() {
    let p = Pool::new();
    let lp = Address::generate(&p.env);

    let deposit = 10_000 * PRECISION; // 10,000 USDC + 10,000 XLM
    p.mint_usdc(&lp, deposit);
    p.mint_xlm(&lp, deposit);

    let shares = p.pool.add_liquidity(&lp, &deposit, &deposit, &1i128);
    let deposited_total = deposit * 2;

    println!("=== LP PROFIT TEST ===");
    println!("Deposited: {} USDC + {} XLM = {} total", deposit, deposit, deposited_total);
    println!("Shares minted: {}", shares);

    let vp_before = p.pool.get_virtual_price();
    println!("Virtual price before swaps: {:.7}", vp_before as f64 / PRECISION as f64);

    // 50 round-trip swaps of 500 USDC each
    // Each round-trip incurs ~2 × 0.04% = 0.08% fee on 500 USDC = ~0.4 USDC
    // 50 round-trips ≈ 20 USDC total fees staying in pool
    p.run_swaps(50, 500 * PRECISION);

    let vp_after = p.pool.get_virtual_price();
    println!("Virtual price after swaps:  {:.7}", vp_after as f64 / PRECISION as f64);
    assert!(vp_after > vp_before, "virtual price must rise after fees: {vp_before} -> {vp_after}");

    // LP removes ALL liquidity
    let (withdrawn_usdc, withdrawn_xlm) = p.pool.remove_liquidity(&lp, &shares, &1i128, &1i128);
    let withdrawn_total = withdrawn_usdc + withdrawn_xlm;

    println!("Withdrawn: {} USDC + {} XLM = {} total", withdrawn_usdc, withdrawn_xlm, withdrawn_total);
    let profit = withdrawn_total - deposited_total;
    println!("PROFIT: {} strobes = {:.7} tokens", profit, profit as f64 / PRECISION as f64);

    assert!(withdrawn_total > deposited_total,
        "LP must profit: deposited={deposited_total}, withdrawn={withdrawn_total}");
    assert!(profit > 0, "profit must be positive, got {profit}");

    // "No ambiguity about whether profit actually occurred" (see module doc)
    // means checking the LP's real wallet balance, not just the contract's
    // reported return values — a transfer bug could make these diverge even
    // if the internal accounting above looks correct.
    assert_eq!(p.usdc_balance(&lp), withdrawn_usdc, "wallet USDC balance must match reported withdrawal");
    assert_eq!(p.xlm_balance(&lp), withdrawn_xlm, "wallet XLM balance must match reported withdrawal");
    assert_eq!(p.user_value(&lp), withdrawn_total, "wallet total value must match reported withdrawal");

    // Verify profit is in the right ballpark (at least 10 USDC worth from fees)
    let min_expected_profit = 10 * PRECISION;
    assert!(profit >= min_expected_profit,
        "expected at least {min_expected_profit} strobes profit, got {profit}");
}

// ── Test 2: Multiple LPs — profit split proportional to share ────────────────

#[test]
fn test_two_lps_profit_split_proportional() {
    let p = Pool::new();
    let lp_big = Address::generate(&p.env);
    let lp_small = Address::generate(&p.env);

    // lp_big deposits 2× more than lp_small
    let big_deposit = 20_000 * PRECISION;
    let small_deposit = 10_000 * PRECISION;

    p.mint_usdc(&lp_big, big_deposit);
    p.mint_xlm(&lp_big, big_deposit);
    let shares_big = p.pool.add_liquidity(&lp_big, &big_deposit, &big_deposit, &1i128);

    p.mint_usdc(&lp_small, small_deposit);
    p.mint_xlm(&lp_small, small_deposit);
    let shares_small = p.pool.add_liquidity(&lp_small, &small_deposit, &small_deposit, &1i128);

    println!("=== TWO LP PROPORTIONAL SPLIT TEST ===");
    println!("lp_big deposited: {} + {} = {}", big_deposit, big_deposit, big_deposit * 2);
    println!("lp_small deposited: {} + {} = {}", small_deposit, small_deposit, small_deposit * 2);

    // 100 round-trip swaps
    p.run_swaps(100, 1_000 * PRECISION);

    let vp = p.pool.get_virtual_price();
    println!("Virtual price after swaps: {:.7}", vp as f64 / PRECISION as f64);

    let total_shares = p.pool.get_total_shares();

    // lp_big should have ~2× the shares of lp_small
    // (lp_small joined after lp_big so shares_small is slightly less than shares_big/2
    //  due to deposit fee on single-sided join — both joined balanced so exact 2:1)
    println!("shares_big={shares_big} shares_small={shares_small} total={total_shares}");

    let (wb_a, wb_b) = p.pool.remove_liquidity(&lp_big, &shares_big, &1i128, &1i128);
    let (ws_a, ws_b) = p.pool.remove_liquidity(&lp_small, &shares_small, &1i128, &1i128);

    let profit_big = (wb_a + wb_b) as i64 - (big_deposit * 2) as i64;
    let profit_small = (ws_a + ws_b) as i64 - (small_deposit * 2) as i64;

    println!("lp_big withdrawn: {} + {} profit={profit_big}", wb_a, wb_b);
    println!("lp_small withdrawn: {} + {} profit={profit_small}", ws_a, ws_b);

    // Both LPs profit
    assert!(profit_big > 0, "lp_big must profit, got {profit_big}");
    assert!(profit_small > 0, "lp_small must profit, got {profit_small}");

    // lp_big should earn approximately 2× what lp_small earns (proportional to deposit)
    let ratio = profit_big as f64 / profit_small as f64;
    println!("Profit ratio (big/small): {:.3}  (expected ~2.0)", ratio);
    assert!(ratio > 1.8 && ratio < 2.2,
        "profit ratio should be ~2.0 (proportional), got {ratio:.3}");
}

// ── Test 3: Early LP earns more than late LP for equal deposit ───────────────

#[test]
fn test_early_lp_earns_more_than_late_lp() {
    let p = Pool::new();
    let lp_early = Address::generate(&p.env);
    let lp_late = Address::generate(&p.env);

    let deposit = 10_000 * PRECISION;

    // lp_early joins at pool genesis
    p.mint_usdc(&lp_early, deposit);
    p.mint_xlm(&lp_early, deposit);
    let shares_early = p.pool.add_liquidity(&lp_early, &deposit, &deposit, &1i128);

    // 50 swaps happen before lp_late joins
    p.run_swaps(50, 500 * PRECISION);

    let vp_mid = p.pool.get_virtual_price();

    // lp_late joins after fees have already accrued
    p.mint_usdc(&lp_late, deposit);
    p.mint_xlm(&lp_late, deposit);
    let shares_late = p.pool.add_liquidity(&lp_late, &deposit, &deposit, &1i128);

    // 50 more swaps (both earn from here)
    p.run_swaps(50, 500 * PRECISION);

    let vp_final = p.pool.get_virtual_price();

    println!("=== EARLY vs LATE LP ===");
    println!("Virtual price at lp_late join: {:.7}", vp_mid as f64 / PRECISION as f64);
    println!("Virtual price at end:          {:.7}", vp_final as f64 / PRECISION as f64);

    let (we_a, we_b) = p.pool.remove_liquidity(&lp_early, &shares_early, &1i128, &1i128);
    let (wl_a, wl_b) = p.pool.remove_liquidity(&lp_late, &shares_late, &1i128, &1i128);

    let profit_early = (we_a + we_b) as i64 - (deposit * 2) as i64;
    let profit_late = (wl_a + wl_b) as i64 - (deposit * 2) as i64;

    println!("lp_early profit: {profit_early} strobes = {:.7} tokens", profit_early as f64 / PRECISION as f64);
    println!("lp_late  profit: {profit_late} strobes = {:.7} tokens", profit_late as f64 / PRECISION as f64);

    // Both must profit
    assert!(profit_early > 0, "early LP must profit, got {profit_early}");
    assert!(profit_late > 0, "late LP must profit, got {profit_late}");

    // Early LP profits more (captured the first 50 swaps the late LP missed)
    assert!(profit_early > profit_late,
        "early LP ({profit_early}) should earn more than late LP ({profit_late})");
}

// ── Test 4: Partial withdrawal — proportional profit, remaining position grows ──

#[test]
fn test_partial_withdrawal_retains_growing_position() {
    let p = Pool::new();
    let lp = Address::generate(&p.env);

    let deposit = 20_000 * PRECISION;
    p.mint_usdc(&lp, deposit);
    p.mint_xlm(&lp, deposit);
    let shares = p.pool.add_liquidity(&lp, &deposit, &deposit, &1i128);

    // 50 swaps
    p.run_swaps(50, 1_000 * PRECISION);

    // Withdraw half the position
    let half = shares / 2;
    let (wa, wb) = p.pool.remove_liquidity(&lp, &half, &1i128, &1i128);
    let half_withdrawn = wa + wb;
    let half_deposited = deposit; // half of total = 1 side each

    println!("=== PARTIAL WITHDRAWAL ===");
    println!("Half deposited value: {half_deposited}");
    println!("Half withdrawn value: {half_withdrawn}");
    let half_profit = half_withdrawn as i64 - half_deposited as i64;
    println!("Half profit: {half_profit}");

    assert!(half_withdrawn > half_deposited,
        "partial withdrawal must also profit: deposited={half_deposited} withdrawn={half_withdrawn}");

    // 50 more swaps — remaining position continues to accumulate
    let pos_before = p.lp_position_value(&lp);
    p.run_swaps(50, 1_000 * PRECISION);
    let pos_after = p.lp_position_value(&lp);

    println!("Remaining position before more swaps: {pos_before}");
    println!("Remaining position after more swaps:  {pos_after}");

    assert!(pos_after > pos_before,
        "remaining position must keep growing: before={pos_before} after={pos_after}");
}

// ── Test 5: Fee size sanity — 4 bps matches math exactly ────────────────────

#[test]
fn test_fee_is_exactly_4_bps() {
    let p = Pool::new();
    let lp = Address::generate(&p.env);

    let pool_size = 10_000_000 * PRECISION;
    p.mint_usdc(&lp, pool_size);
    p.mint_xlm(&lp, pool_size);
    p.pool.add_liquidity(&lp, &pool_size, &pool_size, &1i128);

    let swap_amt = 1_000 * PRECISION;

    let (out, fee) = p.pool.get_swap_result(&p.usdc, &swap_amt);

    // fee should be ≈ swap_amt × 4 / 10_000 = 4000 strobes per 1000 USDC
    let expected_fee = swap_amt * 4 / 10_000;
    println!("=== FEE SANITY ===");
    println!("Swap:     {} USDC", swap_amt);
    println!("Fee:      {} strobes (expected ~{})", fee, expected_fee);
    println!("Out:      {} XLM", out);
    println!("Effective fee: {:.4} bps", fee as f64 / swap_amt as f64 * 10_000_f64);

    // Within ±10% of expected fee (StableSwap fee applies to invariant, not input directly)
    assert!(fee >= expected_fee * 9 / 10, "fee too low: got {fee}, expected ~{expected_fee}");
    assert!(fee <= expected_fee * 11 / 10, "fee too high: got {fee}, expected ~{expected_fee}");
}

// ── Test 6: Large volume test — 500 swaps, measurable APR ───────────────────

#[test]
fn test_high_volume_measurable_apr() {
    let p = Pool::new();
    let lp = Address::generate(&p.env);

    let deposit = 100_000 * PRECISION; // 100k USDC + 100k XLM
    p.mint_usdc(&lp, deposit);
    p.mint_xlm(&lp, deposit);
    let shares = p.pool.add_liquidity(&lp, &deposit, &deposit, &1i128);

    let deposited_total = deposit * 2;
    let vp_start = p.pool.get_virtual_price();

    // Simulate a busy day: 500 swaps of 1,000 USDC each = 500,000 USDC volume
    // Expected fees: 500 × 1,000 × 2 (round-trip) × 0.04% = 400 USDC in pool
    // But our LP owns 100% of pool, so LP gets all 400 USDC
    p.run_swaps(500, 1_000 * PRECISION);

    let vp_end = p.pool.get_virtual_price();

    let (wa, wb) = p.pool.remove_liquidity(&lp, &shares, &1i128, &1i128);
    let withdrawn_total = wa + wb;
    let profit = withdrawn_total - deposited_total;

    // APR estimate: profit / deposited × annualized (assume 1 day volume = 365 days)
    // This is illustrative — we're just checking the math works
    let apr_bps = profit * 10_000 * 365 / deposited_total;

    println!("=== HIGH VOLUME APR TEST ===");
    println!("Deposited:    {} tokens total", deposited_total / PRECISION);
    println!("Withdrawn:    {} tokens total", withdrawn_total / PRECISION);
    println!("Profit:       {:.4} tokens", profit as f64 / PRECISION as f64);
    println!("Virtual price: {:.7} → {:.7}",
        vp_start as f64 / PRECISION as f64,
        vp_end as f64 / PRECISION as f64);
    println!("Implied annual APR (extrapolated from 500-swap session): {:.2}%",
        apr_bps as f64 / 100.0);

    assert!(withdrawn_total > deposited_total, "must profit: dep={deposited_total} wit={withdrawn_total}");
    assert!(profit >= 100 * PRECISION, "expected at least 100 tokens profit from 500k volume, got {profit}");
    assert!(vp_end > vp_start, "virtual price must grow");
}

// ── Test 7: LP with no swaps earns nothing (fees come only from activity) ────

#[test]
fn test_lp_earns_nothing_without_swaps() {
    let p = Pool::new();
    let lp = Address::generate(&p.env);

    let deposit = 10_000 * PRECISION;
    p.mint_usdc(&lp, deposit);
    p.mint_xlm(&lp, deposit);
    let shares = p.pool.add_liquidity(&lp, &deposit, &deposit, &1i128);

    // No swaps happen at all
    let vp = p.pool.get_virtual_price();
    assert_eq!(vp, PRECISION, "virtual price starts exactly at 1.0: {vp}");

    let (wa, wb) = p.pool.remove_liquidity(&lp, &shares, &1i128, &1i128);
    let withdrawn = wa + wb;
    let deposited = deposit * 2;

    println!("=== ZERO SWAP TEST ===");
    println!("Deposited: {} | Withdrawn: {} | Diff: {}", deposited, withdrawn, withdrawn as i64 - deposited as i64);

    // Should get back exactly what was deposited (±1 strobe rounding)
    assert!((withdrawn as i64 - deposited as i64).abs() <= 2,
        "no profit/loss without swaps: deposited={deposited} withdrawn={withdrawn}");
}

// ── Test 8: Virtual price is 1-way — never decreases ─────────────────────────

#[test]
fn test_virtual_price_monotonically_increases() {
    let p = Pool::new();
    let lp = Address::generate(&p.env);

    let deposit = 1_000_000 * PRECISION;
    p.mint_usdc(&lp, deposit);
    p.mint_xlm(&lp, deposit);
    p.pool.add_liquidity(&lp, &deposit, &deposit, &1i128);

    let mut last_vp = p.pool.get_virtual_price();

    for i in 0..20 {
        p.run_swaps(5, 10_000 * PRECISION);
        let vp = p.pool.get_virtual_price();
        assert!(vp >= last_vp,
            "virtual price decreased at iteration {i}: {last_vp} -> {vp}");
        last_vp = vp;
    }

    println!("Virtual price after 100 swaps: {:.7}", last_vp as f64 / PRECISION as f64);
    assert!(last_vp > PRECISION, "virtual price must be above 1.0 after fees");
}

// ── Test 9: Swap price is the real market rate (not virtual price) ────────────

#[test]
fn test_swap_price_reflects_real_exchange_rate() {
    let p = Pool::new();
    let lp = Address::generate(&p.env);

    let deposit = 1_000_000 * PRECISION;
    p.mint_usdc(&lp, deposit);
    p.mint_xlm(&lp, deposit);
    p.pool.add_liquidity(&lp, &deposit, &deposit, &1i128);

    // Balanced pool: 1 USDC should get ~1 XLM (minus 4bps fee)
    let swap_1_usdc = PRECISION; // exactly 1 token
    let (out, fee) = p.pool.get_swap_result(&p.usdc, &swap_1_usdc);

    let exchange_rate = out as f64 / swap_1_usdc as f64; // XLM per USDC
    let spot = p.pool.get_spot_price(&p.usdc); // from contract

    println!("=== REAL EXCHANGE RATE TEST ===");
    println!("Swap 1 USDC → {:.7} XLM", out as f64 / PRECISION as f64);
    println!("Exchange rate: {exchange_rate:.6} XLM/USDC");
    println!("Contract spot price: {:.7}", spot as f64 / PRECISION as f64);
    println!("Virtual price (pool health, NOT exchange rate): {:.7}",
        p.pool.get_virtual_price() as f64 / PRECISION as f64);
    println!("Swap fee: {:.4} bps", fee as f64 / swap_1_usdc as f64 * 10_000_f64);

    // In a balanced pool: exchange rate ≈ 1.0 (minus fee)
    assert!(exchange_rate > 0.9995, "exchange rate should be near 1.0 in balanced pool: {exchange_rate}");
    assert!(exchange_rate < 1.0, "should receive less than input due to fee: {exchange_rate}");

    // Virtual price starts at 1.0 — distinct from exchange rate
    let vp = p.pool.get_virtual_price();
    assert_eq!(vp, PRECISION, "virtual price starts at exactly 1.0 in fresh pool");

    // After imbalancing the pool, exchange rate moves but virtual price tracks fee accumulation
    let trader = Address::generate(&p.env);
    p.mint_usdc(&trader, 100_000 * PRECISION);
    p.pool.swap(&trader, &p.usdc, &(100_000 * PRECISION), &1i128);

    let (out_after, _) = p.pool.get_swap_result(&p.usdc, &swap_1_usdc);
    let vp_after = p.pool.get_virtual_price();
    let rate_after = out_after as f64 / swap_1_usdc as f64;

    println!("After large swap — exchange rate: {rate_after:.6}, virtual price: {:.7}",
        vp_after as f64 / PRECISION as f64);

    // Exchange rate changes (pool is now USDC-heavy)
    assert!(rate_after < exchange_rate,
        "exchange rate should drop after USDC-heavy pool: before={exchange_rate:.6} after={rate_after:.6}");

    // Virtual price INCREASED (fees accumulated) — it's a different metric
    assert!(vp_after > PRECISION, "virtual price grew due to fees, even though pool imbalanced");
}

// ── Test 10: Full E2E narrative — Alice provides, Bob swaps, Alice profits ───

#[test]
fn test_full_e2e_alice_lp_bob_trader() {
    let p = Pool::new();
    let alice = Address::generate(&p.env);
    let bob = Address::generate(&p.env);
    let carol = Address::generate(&p.env);

    println!("=== FULL E2E: Alice LP, Bob/Carol trade ===\n");

    // Alice seeds the pool with 50,000 USDC + 50,000 XLM
    let alice_deposit = 50_000 * PRECISION;
    p.mint_usdc(&alice, alice_deposit);
    p.mint_xlm(&alice, alice_deposit);
    let alice_shares = p.pool.add_liquidity(&alice, &alice_deposit, &alice_deposit, &1i128);
    println!("[1] Alice deposits {} USDC + {} XLM, gets {} shares",
        alice_deposit / PRECISION, alice_deposit / PRECISION, alice_shares / PRECISION);

    let vp0 = p.pool.get_virtual_price();
    println!("    Pool virtual price: {:.7}\n", vp0 as f64 / PRECISION as f64);

    // Bob does 20 swaps (USDC → XLM)
    let bob_each = 500 * PRECISION;
    let mut bob_xlm_total = 0i128;
    for _ in 0..20 {
        p.mint_usdc(&bob, bob_each);
        let got = p.pool.swap(&bob, &p.usdc, &bob_each, &1i128);
        bob_xlm_total += got;
    }
    println!("[2] Bob swaps {} × {} USDC → {} XLM total",
        20, bob_each / PRECISION, bob_xlm_total / PRECISION);

    let vp1 = p.pool.get_virtual_price();
    println!("    Pool virtual price after Bob: {:.7}\n", vp1 as f64 / PRECISION as f64);

    // Carol does 20 swaps (XLM → USDC), roughly re-balancing
    let carol_each = 500 * PRECISION;
    let mut carol_usdc_total = 0i128;
    for _ in 0..20 {
        p.mint_xlm(&carol, carol_each);
        let got = p.pool.swap(&carol, &p.xlm, &carol_each, &1i128);
        carol_usdc_total += got;
    }
    println!("[3] Carol swaps {} × {} XLM → {} USDC total",
        20, carol_each / PRECISION, carol_usdc_total / PRECISION);

    let vp2 = p.pool.get_virtual_price();
    println!("    Pool virtual price after Carol: {:.7}\n", vp2 as f64 / PRECISION as f64);

    // Check spot price (real exchange rate — not virtual price)
    let spot = p.pool.get_spot_price(&p.usdc);
    println!("[4] Real exchange rate (get_spot_price): {:.7} XLM per USDC", spot as f64 / PRECISION as f64);
    println!("    Virtual price (fee accumulation):    {:.7}\n", vp2 as f64 / PRECISION as f64);

    // Alice withdraws everything
    let (alice_usdc, alice_xlm) = p.pool.remove_liquidity(&alice, &alice_shares, &1i128, &1i128);
    let alice_out = alice_usdc + alice_xlm;
    let alice_in = alice_deposit * 2;
    let alice_profit = alice_out as i64 - alice_in as i64;

    println!("[5] Alice withdraws: {} USDC + {} XLM = {} total",
        alice_usdc / PRECISION, alice_xlm / PRECISION, alice_out / PRECISION);
    println!("    Alice deposited:  {} total", alice_in / PRECISION);
    println!("    Alice PROFIT:     {:.7} tokens ({:.4} bps return)",
        alice_profit as f64 / PRECISION as f64,
        alice_profit as f64 / alice_in as f64 * 10_000_f64);

    // Final assertions
    assert!(vp1 > vp0, "virtual price rose after Bob's swaps");
    assert!(vp2 > vp1, "virtual price rose after Carol's swaps");
    assert!(alice_profit > 0, "Alice must profit as LP: deposited={alice_in} withdrawn={alice_out}");

    // Spot price should be near 1.0 (pool re-balanced by Carol's swaps)
    let rate = spot as f64 / PRECISION as f64;
    assert!(rate > 0.995 && rate < 1.005,
        "pool should be near-balanced after round-trip trades: rate={rate:.6}");

    println!("\n=== SUMMARY ===");
    println!("Virtual price measures fee accumulation (starts 1.0, only rises).");
    println!("Spot price measures the real USDC/XLM exchange rate (fluctuates with imbalance).");
    println!("Alice earned real yield purely from swap fees — no inflationary rewards needed.");
}
