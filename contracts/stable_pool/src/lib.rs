//! OrbitalDEX Stable Pool
//!
//! A two-token StableSwap pool optimized for stablecoin pairs.
//! Implements the Curve Finance invariant on Stellar Soroban.

#![no_std]

mod errors;
mod events;
mod math;
mod storage;

#[cfg(test)]
mod test;
#[cfg(test)]
mod test_lp_profit;

use errors::PoolError;
use events::{emit_add_liquidity, emit_amp_update, emit_pause, emit_remove_liquidity, emit_swap};
use math::{
    compute_d, compute_deposit_shares, compute_swap, compute_virtual_price, compute_withdrawal,
    MIN_RESERVE,
};
use storage::{
    accrue_protocol_fee, clear_accrued_fees, clear_pending_admin, clear_pending_upgrade,
    current_amp, is_initialized, read_accrued_fees, read_admin, read_fee_bps, read_fee_recipient,
    read_pending_admin, read_pending_upgrade, read_pool_state, read_protocol_fee_bps,
    read_ramp_state, read_reserve_a, read_reserve_b, read_token_a, read_token_b,
    read_total_shares, read_user_shares, write_admin, write_amp_ramp, write_amp_static,
    write_fee_bps, write_paused, write_pending_admin, write_pending_upgrade, write_protocol_fee,
    write_reserve_a, write_reserve_b, write_total_shares, write_token_a, write_token_b,
    write_user_shares, PersistentKey, RampState,
};

use soroban_sdk::{contract, contractimpl, token::TokenClient, Address, BytesN, Env};

pub use errors::PoolError as Error;

const MIN_AMP: u64 = 1;
const MAX_AMP: u64 = 1_000_000;
const MAX_A_CHANGE: u64 = 10;
const MIN_RAMP_TIME: u64 = 86_400;     // 1 day
const MAX_FEE_BPS: u32 = 100;          // 1% max fee
const UPGRADE_TIMELOCK: u64 = 172_800; // 2 days in seconds

#[contract]
pub struct StablePool;

#[contractimpl]
impl StablePool {
    /// Initialize the pool. Called once after deployment.
    ///
    /// CRIT-1 fix: if persistent reserves are non-zero, the pool is live and
    /// re-initialization is refused even if instance storage has expired.
    pub fn initialize(
        e: Env,
        admin: Address,
        token_a: Address,
        token_b: Address,
        amp: u64,
        fee_bps: u32,
    ) -> Result<(), PoolError> {
        if is_initialized(&e) {
            return Err(PoolError::AlreadyInitialized);
        }
        // CRIT-1: guard against re-init after instance TTL expiry on a live pool
        let reserve_a: i128 = e
            .storage()
            .persistent()
            .get(&PersistentKey::ReserveA)
            .unwrap_or(0);
        if reserve_a > 0 {
            return Err(PoolError::AlreadyInitialized);
        }

        if token_a == token_b {
            return Err(PoolError::SameToken);
        }
        if amp < MIN_AMP || amp > MAX_AMP {
            return Err(PoolError::InvalidAmp);
        }
        if fee_bps > MAX_FEE_BPS {
            return Err(PoolError::InvalidFee);
        }

        write_admin(&e, &admin);
        write_token_a(&e, &token_a);
        write_token_b(&e, &token_b);
        write_amp_static(&e, amp);
        write_fee_bps(&e, fee_bps);
        write_paused(&e, false);
        write_reserve_a(&e, 0);
        write_reserve_b(&e, 0);
        write_total_shares(&e, 0);

        Ok(())
    }

    /// Add liquidity to the pool.
    ///
    /// HIGH-2 fix: single-sided first deposit returns a clear error.
    /// HIGH-3 fix: first deposit requires at least PRECISION strobes per token.
    pub fn add_liquidity(
        e: Env,
        from: Address,
        amount_a: i128,
        amount_b: i128,
        min_shares: i128,
    ) -> Result<i128, PoolError> {
        from.require_auth();
        Self::require_not_paused(&e)?;

        if amount_a <= 0 && amount_b <= 0 {
            return Err(PoolError::ZeroAmount);
        }

        let state = read_pool_state(&e);

        // HIGH-2: first deposit must supply both tokens
        if state.total_shares == 0 && (amount_a <= 0 || amount_b <= 0) {
            return Err(PoolError::FirstDepositRequiresBothTokens);
        }

        // HIGH-3: minimum size on first deposit prevents dust LP griefing
        if state.total_shares == 0 {
            if amount_a < math::PRECISION || amount_b < math::PRECISION {
                return Err(PoolError::FirstDepositBelowMinimum);
            }
        }

        let new_reserve_a = state.reserve_a + amount_a;
        let new_reserve_b = state.reserve_b + amount_b;
        if new_reserve_a > 0 && new_reserve_a < MIN_RESERVE {
            return Err(PoolError::MinReserveViolation);
        }
        if new_reserve_b > 0 && new_reserve_b < MIN_RESERVE {
            return Err(PoolError::MinReserveViolation);
        }

        let (shares_minted, _fees) = compute_deposit_shares(
            [state.reserve_a, state.reserve_b],
            [amount_a, amount_b],
            state.total_shares,
            state.amp,
            state.fee_bps,
        )?;

        if shares_minted < min_shares {
            return Err(PoolError::SlippageExceeded);
        }
        if shares_minted <= 0 {
            return Err(PoolError::ZeroAmount);
        }

        let contract = e.current_contract_address();
        if amount_a > 0 {
            TokenClient::new(&e, &state.token_a).transfer(&from, &contract, &amount_a);
        }
        if amount_b > 0 {
            TokenClient::new(&e, &state.token_b).transfer(&from, &contract, &amount_b);
        }

        let new_user_shares = read_user_shares(&e, &from) + shares_minted;
        write_user_shares(&e, &from, new_user_shares);
        write_total_shares(&e, state.total_shares + shares_minted);
        write_reserve_a(&e, new_reserve_a);
        write_reserve_b(&e, new_reserve_b);

        emit_add_liquidity(
            &e,
            &from,
            amount_a,
            amount_b,
            shares_minted,
            new_reserve_a,
            new_reserve_b,
        );

        Ok(shares_minted)
    }

    /// Remove liquidity proportionally.
    pub fn remove_liquidity(
        e: Env,
        from: Address,
        shares: i128,
        min_amount_a: i128,
        min_amount_b: i128,
    ) -> Result<(i128, i128), PoolError> {
        from.require_auth();
        Self::require_not_paused(&e)?;

        if shares <= 0 {
            return Err(PoolError::InvalidShareAmount);
        }

        let user_shares = read_user_shares(&e, &from);
        if user_shares < shares {
            return Err(PoolError::InsufficientBalance);
        }

        let state = read_pool_state(&e);
        let amounts = compute_withdrawal(
            [state.reserve_a, state.reserve_b],
            shares,
            state.total_shares,
        )?;

        if amounts[0] < min_amount_a || amounts[1] < min_amount_b {
            return Err(PoolError::SlippageExceeded);
        }
        if amounts[0] <= 0 && amounts[1] <= 0 {
            return Err(PoolError::InsufficientLiquidity);
        }

        write_user_shares(&e, &from, user_shares - shares);
        write_total_shares(&e, state.total_shares - shares);
        let new_reserve_a = state.reserve_a - amounts[0];
        let new_reserve_b = state.reserve_b - amounts[1];
        write_reserve_a(&e, new_reserve_a);
        write_reserve_b(&e, new_reserve_b);

        let contract = e.current_contract_address();
        if amounts[0] > 0 {
            TokenClient::new(&e, &state.token_a).transfer(&contract, &from, &amounts[0]);
        }
        if amounts[1] > 0 {
            TokenClient::new(&e, &state.token_b).transfer(&contract, &from, &amounts[1]);
        }

        emit_remove_liquidity(
            &e,
            &from,
            shares,
            amounts[0],
            amounts[1],
            new_reserve_a,
            new_reserve_b,
        );

        Ok((amounts[0], amounts[1]))
    }

    /// Execute a swap.
    pub fn swap(
        e: Env,
        from: Address,
        token_in: Address,
        amount_in: i128,
        min_amount_out: i128,
    ) -> Result<i128, PoolError> {
        from.require_auth();
        Self::require_not_paused(&e)?;

        if amount_in <= 0 {
            return Err(PoolError::ZeroAmount);
        }

        let state = read_pool_state(&e);

        let (token_in_idx, token_out_addr) = if token_in == state.token_a {
            (0usize, state.token_b.clone())
        } else if token_in == state.token_b {
            (1usize, state.token_a.clone())
        } else {
            return Err(PoolError::InvalidToken);
        };

        let xp = [state.reserve_a, state.reserve_b];
        let (dy, fee) = compute_swap(xp, token_in_idx, amount_in, state.amp, state.fee_bps)?;

        if dy < min_amount_out {
            return Err(PoolError::SlippageExceeded);
        }

        let contract = e.current_contract_address();
        TokenClient::new(&e, &token_in).transfer(&from, &contract, &amount_in);
        TokenClient::new(&e, &token_out_addr).transfer(&contract, &from, &dy);

        let protocol_fee_bps = read_protocol_fee_bps(&e);
        let protocol_fee = if protocol_fee_bps > 0 && read_fee_recipient(&e).is_some() {
            fee * (protocol_fee_bps as i128) / (state.fee_bps as i128)
        } else {
            0
        };

        let (new_ra, new_rb) = if token_in_idx == 0 {
            (state.reserve_a + amount_in - protocol_fee, state.reserve_b - dy)
        } else {
            (state.reserve_a - dy, state.reserve_b + amount_in - protocol_fee)
        };

        write_reserve_a(&e, new_ra);
        write_reserve_b(&e, new_rb);

        if protocol_fee > 0 {
            if token_in_idx == 0 {
                accrue_protocol_fee(&e, protocol_fee, 0);
            } else {
                accrue_protocol_fee(&e, 0, protocol_fee);
            }
        }

        emit_swap(&e, &from, &token_in, &token_out_addr, amount_in, dy, fee, new_ra, new_rb);

        Ok(dy)
    }

    // ── Read-only views ───────────────────────────────────────────────────────

    pub fn get_swap_result(e: Env, token_in: Address, amount_in: i128) -> Result<(i128, i128), PoolError> {
        let state = read_pool_state(&e);
        let token_in_idx = if token_in == state.token_a {
            0usize
        } else if token_in == state.token_b {
            1usize
        } else {
            return Err(PoolError::InvalidToken);
        };
        let xp = [state.reserve_a, state.reserve_b];
        compute_swap(xp, token_in_idx, amount_in, state.amp, state.fee_bps)
    }

    pub fn get_reserves(e: Env) -> (i128, i128) {
        (read_reserve_a(&e), read_reserve_b(&e))
    }

    pub fn get_tokens(e: Env) -> (Address, Address) {
        (read_token_a(&e), read_token_b(&e))
    }

    pub fn get_amp(e: Env) -> u64 {
        current_amp(&e)
    }

    pub fn get_ramp_state(e: Env) -> RampState {
        read_ramp_state(&e)
    }

    pub fn get_fee_bps(e: Env) -> u32 {
        read_fee_bps(&e)
    }

    pub fn get_total_shares(e: Env) -> i128 {
        read_total_shares(&e)
    }

    pub fn get_user_shares(e: Env, user: Address) -> i128 {
        read_user_shares(&e, &user)
    }

    pub fn get_d(e: Env) -> Result<i128, PoolError> {
        let ra  = read_reserve_a(&e);
        let rb  = read_reserve_b(&e);
        let amp = current_amp(&e);
        compute_d([ra, rb], amp)
    }

    pub fn get_virtual_price(e: Env) -> Result<i128, PoolError> {
        let ra    = read_reserve_a(&e);
        let rb    = read_reserve_b(&e);
        let amp   = current_amp(&e);
        let total = read_total_shares(&e);
        compute_virtual_price([ra, rb], total, amp)
    }

    pub fn get_spot_price(e: Env, token_in: Address) -> Result<i128, PoolError> {
        let state = read_pool_state(&e);
        let token_in_idx = if token_in == state.token_a {
            0usize
        } else if token_in == state.token_b {
            1usize
        } else {
            return Err(PoolError::InvalidToken);
        };
        let xp = [state.reserve_a, state.reserve_b];
        let (dy, _) = compute_swap(xp, token_in_idx, math::PRECISION, state.amp, 0)?;
        Ok(dy)
    }

    pub fn is_paused(e: Env) -> bool {
        storage::read_paused(&e)
    }

    pub fn get_pending_upgrade(e: Env) -> Option<(BytesN<32>, u64)> {
        read_pending_upgrade(&e)
    }

    pub fn get_pending_admin(e: Env) -> Option<Address> {
        read_pending_admin(&e)
    }

    // ── Admin functions ───────────────────────────────────────────────────────

    pub fn set_paused(e: Env, paused: bool) -> Result<(), PoolError> {
        let admin = read_admin(&e);
        admin.require_auth();
        write_paused(&e, paused);
        emit_pause(&e, &admin, paused);
        Ok(())
    }

    pub fn ramp_a(e: Env, future_a: u64, future_a_time: u64) -> Result<(), PoolError> {
        let admin = read_admin(&e);
        admin.require_auth();

        if future_a < MIN_AMP || future_a > MAX_AMP {
            return Err(PoolError::InvalidAmp);
        }
        let now = e.ledger().timestamp();
        if future_a_time < now + MIN_RAMP_TIME {
            return Err(PoolError::RampTimeInPast);
        }

        let current_a = current_amp(&e);
        let (lo, hi) = if future_a >= current_a {
            (current_a, future_a)
        } else {
            (future_a, current_a)
        };
        if hi > lo * MAX_A_CHANGE {
            return Err(PoolError::RampTooFast);
        }

        emit_amp_update(&e, &admin, current_a, future_a);
        write_amp_ramp(&e, current_a, future_a, future_a_time);
        Ok(())
    }

    pub fn stop_ramp_a(e: Env) -> Result<(), PoolError> {
        let admin = read_admin(&e);
        admin.require_auth();
        let current_a = current_amp(&e);
        emit_amp_update(&e, &admin, current_a, current_a);
        write_amp_static(&e, current_a);
        Ok(())
    }

    /// MED-5: Propose admin transfer. New admin must call accept_admin() to confirm.
    /// Replaces the immediate transfer_admin() which risked permanent admin loss.
    pub fn propose_admin(e: Env, new_admin: Address) -> Result<(), PoolError> {
        let admin = read_admin(&e);
        admin.require_auth();
        write_pending_admin(&e, &new_admin);
        Ok(())
    }

    /// MED-5: Accept pending admin transfer. Must be called by the proposed admin.
    pub fn accept_admin(e: Env) -> Result<(), PoolError> {
        let pending = read_pending_admin(&e).ok_or(PoolError::NoPendingAdmin)?;
        pending.require_auth();
        write_admin(&e, &pending);
        clear_pending_admin(&e);
        Ok(())
    }

    pub fn set_protocol_fee(e: Env, protocol_fee_bps: u32, recipient: Address) -> Result<(), PoolError> {
        let admin = read_admin(&e);
        admin.require_auth();
        let fee_bps = read_fee_bps(&e);
        if protocol_fee_bps >= fee_bps {
            return Err(PoolError::InvalidProtocolFee);
        }
        write_protocol_fee(&e, protocol_fee_bps, &recipient);
        Ok(())
    }

    pub fn claim_protocol_fees(e: Env) -> Result<(), PoolError> {
        let recipient = read_fee_recipient(&e).ok_or(PoolError::NoProtocolFeeRecipient)?;
        let (fee_a, fee_b) = read_accrued_fees(&e);
        let contract = e.current_contract_address();

        if fee_a > 0 {
            TokenClient::new(&e, &read_token_a(&e)).transfer(&contract, &recipient, &fee_a);
        }
        if fee_b > 0 {
            TokenClient::new(&e, &read_token_b(&e)).transfer(&contract, &recipient, &fee_b);
        }
        clear_accrued_fees(&e);
        Ok(())
    }

    pub fn get_accrued_fees(e: Env) -> (i128, i128) {
        read_accrued_fees(&e)
    }

    // ── Upgrade with 2-day timelock (HIGH-5) ─────────────────────────────────

    /// Propose a WASM upgrade. The upgrade can be executed after UPGRADE_TIMELOCK
    /// seconds (48 hours). Admin only.
    pub fn propose_upgrade(e: Env, new_wasm_hash: BytesN<32>) -> Result<(), PoolError> {
        let admin = read_admin(&e);
        admin.require_auth();
        let execute_after = e.ledger().timestamp() + UPGRADE_TIMELOCK;
        write_pending_upgrade(&e, &new_wasm_hash, execute_after);
        Ok(())
    }

    /// Execute a previously proposed upgrade after the timelock has elapsed.
    /// Can be called by anyone (the proposal is already admin-authorized).
    pub fn execute_upgrade(e: Env) -> Result<(), PoolError> {
        let (wasm_hash, execute_after) =
            read_pending_upgrade(&e).ok_or(PoolError::NoPendingUpgrade)?;
        if e.ledger().timestamp() < execute_after {
            return Err(PoolError::TimelockNotExpired);
        }
        clear_pending_upgrade(&e);
        e.deployer().update_current_contract_wasm(wasm_hash);
        Ok(())
    }

    /// Cancel a pending upgrade. Admin only.
    pub fn cancel_upgrade(e: Env) -> Result<(), PoolError> {
        read_admin(&e).require_auth();
        if read_pending_upgrade(&e).is_none() {
            return Err(PoolError::NoPendingUpgrade);
        }
        clear_pending_upgrade(&e);
        Ok(())
    }

    // ── Internal guards ───────────────────────────────────────────────────────

    fn require_not_paused(e: &Env) -> Result<(), PoolError> {
        if storage::read_paused(e) {
            Err(PoolError::Paused)
        } else {
            Ok(())
        }
    }
}
