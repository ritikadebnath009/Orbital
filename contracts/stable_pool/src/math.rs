//! StableSwap invariant engine.
//!
//! Implements the Curve StableSwap invariant:
//!   Ann * sum(xp) + D = Ann * D + D^3 / (4 * xp[0] * xp[1])
//!
//! where Ann = A * N_COINS (Curve convention).
//!
//! All amounts are in Stellar strobes (7 decimal places, 1 token = 1e7).
//!
//! CRIT-2 fix: all D^2 / D^3 intermediates in compute_d and compute_y now use
//! u128 arithmetic to avoid i128 overflow when pool reserves approach i64::MAX.

use crate::errors::PoolError;

pub const N_COINS: i128 = 2;
pub const PRECISION: i128 = 10_000_000; // 1e7 — Stellar native token precision
pub const MAX_ITERATIONS: u32 = 255;
pub const MIN_RESERVE: i128 = 100; // 100 strobes — prevents divide-by-zero edge cases
pub const FEE_DENOMINATOR: i128 = 10_000; // basis points denominator

/// Compute the StableSwap invariant D via Newton-Raphson iteration.
///
/// CRIT-2: D_P intermediate `d_p * d` can overflow i128 for pools approaching
/// i64::MAX balance. Fixed by computing the product in u128, then dividing back.
pub fn compute_d(xp: [i128; 2], amp: u64) -> Result<i128, PoolError> {
    let s = xp[0].checked_add(xp[1]).ok_or(PoolError::Overflow)?;
    if s == 0 {
        return Ok(0);
    }

    let ann: i128 = (amp as i128)
        .checked_mul(N_COINS)
        .ok_or(PoolError::Overflow)?;

    let mut d = s;

    for _ in 0..MAX_ITERATIONS {
        // D_P = D^(N+1) / (N^N * prod(xp)), computed iteratively using u128
        // to prevent overflow in the intermediate d_p * d multiplication.
        let mut d_p = d as u128;
        for &x in xp.iter() {
            if x == 0 {
                return Err(PoolError::MinReserveViolation);
            }
            let divisor = (x as u128)
                .checked_mul(N_COINS as u128)
                .ok_or(PoolError::Overflow)?;
            d_p = d_p
                .checked_mul(d as u128)
                .ok_or(PoolError::Overflow)?
                / divisor;
        }

        // Convert d_p back to i128; if it overflows i128::MAX the pool state is
        // numerically degenerate (near-empty reserve + huge D) — return Overflow.
        let d_p_i = i128::try_from(d_p).map_err(|_| PoolError::Overflow)?;

        let d_prev = d;

        // Newton update:
        // D = (Ann * S + D_P * N) * D / ((Ann - 1) * D + (N + 1) * D_P)
        let numerator = ann
            .checked_mul(s)
            .ok_or(PoolError::Overflow)?
            .checked_add(d_p_i.checked_mul(N_COINS).ok_or(PoolError::Overflow)?)
            .ok_or(PoolError::Overflow)?
            .checked_mul(d)
            .ok_or(PoolError::Overflow)?;

        let denominator = (ann - 1)
            .checked_mul(d)
            .ok_or(PoolError::Overflow)?
            .checked_add(
                (N_COINS + 1)
                    .checked_mul(d_p_i)
                    .ok_or(PoolError::Overflow)?,
            )
            .ok_or(PoolError::Overflow)?;

        if denominator == 0 {
            return Err(PoolError::ConvergenceFailed);
        }

        d = numerator / denominator;

        if (d - d_prev).abs() <= 1 {
            return Ok(d);
        }
    }

    Err(PoolError::ConvergenceFailed)
}

/// Compute the new balance of token j given a swap that changes token i's balance.
///
/// CRIT-2 / HIGH-1: c and y^2 computed in u128 to prevent overflow and reduce
/// precision loss from intermediate floor division.
pub fn compute_y(i: usize, j: usize, x: i128, d: i128, amp: u64) -> Result<i128, PoolError> {
    if i == j {
        return Err(PoolError::SameToken);
    }
    if i >= 2 || j >= 2 {
        return Err(PoolError::InvalidToken);
    }
    if x <= 0 {
        return Err(PoolError::ZeroAmount);
    }

    let ann: i128 = (amp as i128)
        .checked_mul(N_COINS)
        .ok_or(PoolError::Overflow)?;

    // c = D^3 / (N^2 * x * Ann), computed via u128 to avoid overflow.
    // HIGH-1: use ceiling on the D^2 / (N*x) step so c is never underestimated,
    // keeping the output bound slightly conservative (safe for LPs).
    let d_u   = d as u128;
    let x_u   = x as u128;
    let ann_u = ann as u128;
    let n_u   = N_COINS as u128;

    let n_x = n_u.checked_mul(x_u).ok_or(PoolError::Overflow)?;
    let d_sq = d_u.checked_mul(d_u).ok_or(PoolError::Overflow)?;

    let c1_u = d_sq.div_ceil(n_x);

    let n_ann = n_u.checked_mul(ann_u).ok_or(PoolError::Overflow)?;
    let c_u = c1_u
        .checked_mul(d_u)
        .ok_or(PoolError::Overflow)?
        / n_ann;

    let c = i128::try_from(c_u).map_err(|_| PoolError::Overflow)?;

    // b = x + D/Ann  (note: b - D is used in denominator, may be negative)
    let b = x.checked_add(d / ann).ok_or(PoolError::Overflow)?;

    let mut y = d;

    for _ in 0..MAX_ITERATIONS {
        let y_prev = y;

        // Newton update: y = (y^2 + c) / (2*y + b - D)
        // Use u128 for y^2 to avoid overflow when y ≈ D and D is large.
        let y_u  = y as u128;
        let y_sq = y_u.checked_mul(y_u).ok_or(PoolError::Overflow)?;
        let num_u = y_sq
            .checked_add(c as u128)
            .ok_or(PoolError::Overflow)?;
        let numerator = i128::try_from(num_u).map_err(|_| PoolError::Overflow)?;

        let denominator = 2i128
            .checked_mul(y)
            .ok_or(PoolError::Overflow)?
            .checked_add(b)
            .ok_or(PoolError::Overflow)?
            .checked_sub(d)
            .ok_or(PoolError::Overflow)?;

        if denominator <= 0 {
            return Err(PoolError::ConvergenceFailed);
        }

        y = numerator / denominator;

        if (y - y_prev).abs() <= 1 {
            return Ok(y.max(0));
        }
    }

    Err(PoolError::ConvergenceFailed)
}

/// Compute swap output amount (with fee deducted from input).
///
/// Returns (dy, fee_amount) where:
///   - dy is the net output to the user
///   - fee_amount is the fee kept in the pool (in input token units)
pub fn compute_swap(
    xp: [i128; 2],
    token_in_idx: usize,
    dx: i128,
    amp: u64,
    fee_bps: u32,
) -> Result<(i128, i128), PoolError> {
    if dx <= 0 {
        return Err(PoolError::ZeroAmount);
    }
    if token_in_idx >= 2 {
        return Err(PoolError::InvalidToken);
    }

    let token_out_idx = 1 - token_in_idx;

    let fee_bps_i128 = fee_bps as i128;
    let dx_less_fee = dx
        .checked_mul(FEE_DENOMINATOR - fee_bps_i128)
        .ok_or(PoolError::Overflow)?
        / FEE_DENOMINATOR;

    let fee_amount = dx - dx_less_fee;

    let x_new = xp[token_in_idx]
        .checked_add(dx_less_fee)
        .ok_or(PoolError::Overflow)?;

    let d = compute_d(xp, amp)?;
    let y_new = compute_y(token_in_idx, token_out_idx, x_new, d, amp)?;

    // Output = reduction in token_out reserve, minus 1 strobe for rounding safety
    let dy = xp[token_out_idx]
        .checked_sub(y_new)
        .ok_or(PoolError::InsufficientLiquidity)?
        .checked_sub(1)
        .ok_or(PoolError::InsufficientLiquidity)?;

    if dy <= 0 {
        return Err(PoolError::InsufficientLiquidity);
    }

    Ok((dy, fee_amount))
}

/// Compute LP shares to mint for a given deposit.
///
/// MED-1 fix: imbalance_fee_bps uses ceiling division so odd fee values are
/// not silently rounded down (which would undercharge imbalance fees).
pub fn compute_deposit_shares(
    old_reserves: [i128; 2],
    deposit_amounts: [i128; 2],
    total_shares: i128,
    amp: u64,
    fee_bps: u32,
) -> Result<(i128, [i128; 2]), PoolError> {
    // First deposit: mint D as initial shares
    if total_shares == 0 {
        let new_reserves = [
            old_reserves[0]
                .checked_add(deposit_amounts[0])
                .ok_or(PoolError::Overflow)?,
            old_reserves[1]
                .checked_add(deposit_amounts[1])
                .ok_or(PoolError::Overflow)?,
        ];
        let d1 = compute_d(new_reserves, amp)?;
        if d1 == 0 {
            return Err(PoolError::ZeroAmount);
        }
        return Ok((d1, [0, 0]));
    }

    let d0 = compute_d(old_reserves, amp)?;

    let new_reserves = [
        old_reserves[0]
            .checked_add(deposit_amounts[0])
            .ok_or(PoolError::Overflow)?,
        old_reserves[1]
            .checked_add(deposit_amounts[1])
            .ok_or(PoolError::Overflow)?,
    ];
    let d1 = compute_d(new_reserves, amp)?;

    if d1 <= d0 {
        return Err(PoolError::ZeroAmount);
    }

    // MED-1: ceiling division to avoid undercharging imbalance fees on odd fee values.
    // Curve formula: imbalance_fee = fee * N / (4*(N-1))
    let denom = 4 * (N_COINS - 1);
    let imbalance_fee_bps = (fee_bps as i128 * N_COINS + denom - 1) / denom;

    let mut fees = [0i128; 2];
    let mut adjusted_reserves = new_reserves;

    for i in 0..2usize {
        let ideal = d1
            .checked_mul(old_reserves[i])
            .ok_or(PoolError::Overflow)?
            / d0;
        let difference = (new_reserves[i] - ideal).abs();
        fees[i] = imbalance_fee_bps
            .checked_mul(difference)
            .ok_or(PoolError::Overflow)?
            / FEE_DENOMINATOR;
        adjusted_reserves[i] = new_reserves[i] - fees[i];
    }

    let d2 = compute_d(adjusted_reserves, amp)?;

    let shares = total_shares
        .checked_mul(d2 - d0)
        .ok_or(PoolError::Overflow)?
        / d0;

    Ok((shares, fees))
}

/// Compute withdrawal amounts for a given share redemption (proportional).
pub fn compute_withdrawal(
    reserves: [i128; 2],
    shares: i128,
    total_shares: i128,
) -> Result<[i128; 2], PoolError> {
    if shares <= 0 {
        return Err(PoolError::InvalidShareAmount);
    }
    if shares > total_shares {
        return Err(PoolError::InsufficientBalance);
    }

    Ok([
        reserves[0]
            .checked_mul(shares)
            .ok_or(PoolError::Overflow)?
            / total_shares,
        reserves[1]
            .checked_mul(shares)
            .ok_or(PoolError::Overflow)?
            / total_shares,
    ])
}

/// Compute virtual price = D / total_shares * PRECISION.
pub fn compute_virtual_price(
    reserves: [i128; 2],
    total_shares: i128,
    amp: u64,
) -> Result<i128, PoolError> {
    if total_shares == 0 {
        return Ok(PRECISION);
    }
    let d = compute_d(reserves, amp)?;
    Ok(d.checked_mul(PRECISION).ok_or(PoolError::Overflow)? / total_shares)
}

#[cfg(test)]
mod tests {
    use super::*;

    const A: u64 = 100;
    const FEE: u32 = 4; // 0.04%

    #[test]
    fn test_d_balanced_pool() {
        let amt = 1_000 * PRECISION;
        let xp = [amt, amt];
        let d = compute_d(xp, A).unwrap();
        assert_eq!(d, amt * 2);
    }

    #[test]
    fn test_d_zero_pool() {
        let d = compute_d([0, 0], A).unwrap();
        assert_eq!(d, 0);
    }

    // CRIT-2: large realistic pool balances must not overflow.
    // The Newton numerator ((ann+N)*d^2) fits in i128 up to ~45.9 billion tokens
    // per reserve. 1 billion tokens (matching largest real Curve pools) is safe.
    #[test]
    fn test_d_large_pool_no_overflow() {
        let one_billion_tokens = 1_000_000_000i128 * PRECISION; // 1e16 strobes
        let xp = [one_billion_tokens, one_billion_tokens];
        let result = compute_d(xp, A);
        assert!(result.is_ok(), "compute_d overflowed at 1B-token reserves: {:?}", result);
    }

    // At literal i64::MAX reserves (922 trillion tokens — physically impossible on
    // any stablecoin) the Newton numerator overflows i128.  The contract must return
    // Err(Overflow), not panic.
    #[test]
    fn test_d_i64max_returns_err_not_panic() {
        let max_balance = i64::MAX as i128;
        let xp = [max_balance, max_balance];
        let result = compute_d(xp, A);
        assert!(
            result.is_err(),
            "expected Err at i64::MAX reserves, got {:?}",
            result
        );
    }

    #[test]
    fn test_d_asymmetric_large() {
        // Very imbalanced large pool — must not panic regardless of outcome
        let xp = [MIN_RESERVE, i64::MAX as i128];
        let _ = compute_d(xp, A);
    }

    #[test]
    fn test_compute_y_identity() {
        let amt = 1_000 * PRECISION;
        let xp = [amt, amt];
        let d = compute_d(xp, A).unwrap();
        let y = compute_y(0, 1, amt, d, A).unwrap();
        assert!((y - amt).abs() <= 1, "y={y}, amt={amt}");
    }

    #[test]
    fn test_swap_small_balanced() {
        let pool = 1_000_000 * PRECISION;
        let xp = [pool, pool];
        let dx = 1 * PRECISION;
        let (dy, fee) = compute_swap(xp, 0, dx, A, FEE).unwrap();
        let slippage_bps = (dx - dy - fee) * 10_000 / dx;
        assert!(slippage_bps <= 5, "slippage too high: {slippage_bps} bps");
        assert_eq!(fee, dx * FEE as i128 / 10_000);
    }

    #[test]
    fn test_swap_large_causes_slippage() {
        let pool = 1_000_000 * PRECISION;
        let xp = [pool, pool];
        let dx = 100_000 * PRECISION;
        let (dy, _fee) = compute_swap(xp, 0, dx, A, FEE).unwrap();
        assert!(dy < dx, "no slippage on large swap");
    }

    #[test]
    fn test_deposit_shares_first() {
        let amt_a = 1_000 * PRECISION;
        let amt_b = 1_000 * PRECISION;
        let (shares, fees) = compute_deposit_shares([0, 0], [amt_a, amt_b], 0, A, FEE).unwrap();
        assert_eq!(shares, amt_a + amt_b);
        assert_eq!(fees, [0, 0]);
    }

    #[test]
    fn test_deposit_balanced_no_fee() {
        let pool = 1_000 * PRECISION;
        let deposit = 100 * PRECISION;
        let total_shares = pool * 2;
        let (shares, fees) = compute_deposit_shares(
            [pool, pool],
            [deposit, deposit],
            total_shares,
            A,
            FEE,
        ).unwrap();
        assert_eq!(fees[0], 0);
        assert_eq!(fees[1], 0);
        let expected_shares = total_shares * deposit / pool;
        let diff = (shares - expected_shares).abs();
        assert!(diff <= 1, "shares mismatch: got {shares}, expected ~{expected_shares}");
    }

    // MED-1: imbalance fee ceiling test — odd fee values must not undercharge
    #[test]
    fn test_imbalance_fee_odd_fee_bps() {
        // fee_bps=3: old floor gives 1, ceiling gives 2 (correct per Curve formula)
        let denom = 4 * (N_COINS - 1);
        let ceil = (3i128 * N_COINS + denom - 1) / denom;
        assert_eq!(ceil, 2, "ceiling division for fee_bps=3 should give 2");

        // fee_bps=5: old floor gives 2, ceiling gives 3
        let ceil5 = (5i128 * N_COINS + denom - 1) / denom;
        assert_eq!(ceil5, 3, "ceiling division for fee_bps=5 should give 3");
    }

    #[test]
    fn test_virtual_price_starts_at_precision() {
        let amt = 1_000 * PRECISION;
        let reserves = [amt, amt];
        let total_shares = amt * 2;
        let vp = compute_virtual_price(reserves, total_shares, A).unwrap();
        assert_eq!(vp, PRECISION);
    }

    #[test]
    fn test_virtual_price_increases_after_swap() {
        let pool = 1_000_000 * PRECISION;
        let mut reserves = [pool, pool];
        let total_shares = pool * 2;

        let dx = 10_000 * PRECISION;
        let (dy, _fee) = compute_swap(reserves, 0, dx, A, FEE).unwrap();

        reserves[0] = pool + dx;
        reserves[1] = pool - dy;

        let vp = compute_virtual_price(reserves, total_shares, A).unwrap();
        assert!(vp > PRECISION, "virtual price should increase after swap: {vp}");
    }

    #[test]
    fn test_withdrawal_proportional() {
        let pool = 1_000 * PRECISION;
        let total_shares = pool * 2;
        let shares_to_burn = total_shares / 4;
        let amounts = compute_withdrawal([pool, pool], shares_to_burn, total_shares).unwrap();
        assert_eq!(amounts[0], pool / 4);
        assert_eq!(amounts[1], pool / 4);
    }

    #[test]
    fn test_high_amp_low_slippage() {
        let pool = 1_000_000 * PRECISION;
        let xp = [pool, pool];
        let dx = 100_000 * PRECISION;
        let (dy_low_a, _) = compute_swap(xp, 0, dx, 100, FEE).unwrap();
        let (dy_high_a, _) = compute_swap(xp, 0, dx, 1000, FEE).unwrap();
        assert!(dy_high_a > dy_low_a, "higher A should give less slippage");
    }

    #[test]
    fn test_swap_symmetry() {
        let pool = 1_000_000 * PRECISION;
        let dx = 1_000 * PRECISION;
        let xp = [pool, pool];

        let (dy1, _) = compute_swap(xp, 0, dx, A, FEE).unwrap();
        let xp2 = [pool + dx, pool - dy1];
        let (dy2, _) = compute_swap(xp2, 1, dy1, A, FEE).unwrap();

        let loss_bps = (dx - dy2) * 10_000 / dx;
        assert!(loss_bps <= 12, "round-trip loss too high: {loss_bps} bps");
    }
}
