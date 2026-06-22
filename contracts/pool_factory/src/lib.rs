//! OrbitalDEX Pool Factory
//!
//! Deploys StablePool instances on-chain and maintains the token-pair → pool registry.

#![no_std]

mod events;
mod storage;

#[cfg(test)]
mod test;

use events::{emit_pool_created, emit_wasm_hash_updated};
use storage::{
    clear_pending_admin, clear_pending_upgrade, is_initialized, read_admin, read_pending_admin,
    read_pending_upgrade, read_pool_by_pair, read_pool_count, read_pool_wasm_hash, read_pools_vec,
    write_admin, write_pending_admin, write_pending_upgrade, write_pool_entry, write_pool_wasm_hash,
};

use soroban_sdk::{
    contract, contractimpl, contracterror, contracttype,
    Address, BytesN, Env, IntoVal, Symbol, Val, Vec,
};

const UPGRADE_TIMELOCK: u64 = 172_800; // 2 days

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum FactoryError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    PoolAlreadyExists = 3,
    PoolNotFound = 4,
    InvalidTokens = 5,
    Unauthorized = 6,
    InvalidAmp = 7,
    InvalidFee = 8,
    // MED-5 / HIGH-5 governance errors
    NoPendingAdmin = 9,
    TimelockNotExpired = 10,
    NoPendingUpgrade = 11,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct PoolInfo {
    pub address: Address,
    pub token_a: Address,
    pub token_b: Address,
    pub amp: u64,
    pub fee_bps: u32,
}

#[contract]
pub struct PoolFactory;

#[contractimpl]
impl PoolFactory {
    pub fn initialize(e: Env, admin: Address, pool_wasm_hash: BytesN<32>) -> Result<(), FactoryError> {
        if is_initialized(&e) {
            return Err(FactoryError::AlreadyInitialized);
        }
        write_admin(&e, &admin);
        write_pool_wasm_hash(&e, &pool_wasm_hash);
        Ok(())
    }

    pub fn create_pool(
        e: Env,
        creator: Address,
        token_a: Address,
        token_b: Address,
        amp: u64,
        fee_bps: u32,
    ) -> Result<Address, FactoryError> {
        creator.require_auth();

        if !is_initialized(&e) {
            return Err(FactoryError::NotInitialized);
        }
        if token_a == token_b {
            return Err(FactoryError::InvalidTokens);
        }
        if !(1..=1_000_000).contains(&amp) {
            return Err(FactoryError::InvalidAmp);
        }
        if fee_bps > 100 {
            return Err(FactoryError::InvalidFee);
        }

        let (canon_a, canon_b) = canonical_pair(&token_a, &token_b);

        if read_pool_by_pair(&e, &canon_a, &canon_b).is_some() {
            return Err(FactoryError::PoolAlreadyExists);
        }

        let wasm_hash  = read_pool_wasm_hash(&e);
        let pool_count = read_pool_count(&e);
        let salt       = make_salt(&e, pool_count);

        let pool_address = e
            .deployer()
            .with_current_contract(salt)
            .deploy_v2(wasm_hash, ());

        let admin = read_admin(&e);
        let args: Vec<Val> = soroban_sdk::vec![
            &e,
            admin.into_val(&e),
            canon_a.clone().into_val(&e),
            canon_b.clone().into_val(&e),
            amp.into_val(&e),
            fee_bps.into_val(&e),
        ];
        e.invoke_contract::<()>(&pool_address, &Symbol::new(&e, "initialize"), args);

        write_pool_entry(&e, &canon_a, &canon_b, &pool_address, amp, fee_bps, pool_count);
        emit_pool_created(&e, &creator, &pool_address, &canon_a, &canon_b, amp, fee_bps);

        Ok(pool_address)
    }

    // ── Read views ────────────────────────────────────────────────────────────

    pub fn get_pool(e: Env, token_a: Address, token_b: Address) -> Option<Address> {
        let (a, b) = canonical_pair(&token_a, &token_b);
        read_pool_by_pair(&e, &a, &b)
    }

    pub fn get_pool_info(e: Env, token_a: Address, token_b: Address) -> Result<PoolInfo, FactoryError> {
        let (a, b) = canonical_pair(&token_a, &token_b);
        storage::read_pool_info(&e, &a, &b).ok_or(FactoryError::PoolNotFound)
    }

    pub fn get_all_pools(e: Env) -> Vec<Address> {
        read_pools_vec(&e)
    }

    pub fn pool_count(e: Env) -> u32 {
        read_pool_count(&e)
    }

    pub fn get_pending_upgrade(e: Env) -> Option<(BytesN<32>, u64)> {
        read_pending_upgrade(&e)
    }

    pub fn get_pending_admin(e: Env) -> Option<Address> {
        read_pending_admin(&e)
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    pub fn set_pool_wasm_hash(e: Env, new_hash: BytesN<32>) -> Result<(), FactoryError> {
        let admin = read_admin(&e);
        admin.require_auth();
        let old = read_pool_wasm_hash(&e);
        write_pool_wasm_hash(&e, &new_hash);
        emit_wasm_hash_updated(&e, &admin, old, new_hash);
        Ok(())
    }

    /// MED-5: Propose admin transfer. New admin must call accept_admin().
    pub fn propose_admin(e: Env, new_admin: Address) -> Result<(), FactoryError> {
        read_admin(&e).require_auth();
        write_pending_admin(&e, &new_admin);
        Ok(())
    }

    /// MED-5: Accept pending admin transfer.
    pub fn accept_admin(e: Env) -> Result<(), FactoryError> {
        let pending = read_pending_admin(&e).ok_or(FactoryError::NoPendingAdmin)?;
        pending.require_auth();
        write_admin(&e, &pending);
        clear_pending_admin(&e);
        Ok(())
    }

    /// HIGH-6: Pause all pools, returning a list of any that failed to pause.
    /// Using try_invoke_contract so one broken pool cannot block others.
    pub fn pause_all(e: Env) -> Result<Vec<Address>, FactoryError> {
        let admin = read_admin(&e);
        admin.require_auth();
        let pools = read_pools_vec(&e);
        let mut failed: Vec<Address> = Vec::new(&e);
        for pool_addr in pools.iter() {
            let args: Vec<Val> = soroban_sdk::vec![&e, true.into_val(&e)];
            if e.try_invoke_contract::<(), FactoryError>(
                &pool_addr,
                &Symbol::new(&e, "set_paused"),
                args,
            ).is_err() {
                failed.push_back(pool_addr);
            }
        }
        Ok(failed)
    }

    // ── Upgrade with 2-day timelock (HIGH-5) ─────────────────────────────────

    pub fn propose_upgrade(e: Env, new_wasm_hash: BytesN<32>) -> Result<(), FactoryError> {
        read_admin(&e).require_auth();
        let execute_after = e.ledger().timestamp() + UPGRADE_TIMELOCK;
        write_pending_upgrade(&e, &new_wasm_hash, execute_after);
        Ok(())
    }

    pub fn execute_upgrade(e: Env) -> Result<(), FactoryError> {
        let (wasm_hash, execute_after) =
            read_pending_upgrade(&e).ok_or(FactoryError::NoPendingUpgrade)?;
        if e.ledger().timestamp() < execute_after {
            return Err(FactoryError::TimelockNotExpired);
        }
        clear_pending_upgrade(&e);
        e.deployer().update_current_contract_wasm(wasm_hash);
        Ok(())
    }

    pub fn cancel_upgrade(e: Env) -> Result<(), FactoryError> {
        read_admin(&e).require_auth();
        if read_pending_upgrade(&e).is_none() {
            return Err(FactoryError::NoPendingUpgrade);
        }
        clear_pending_upgrade(&e);
        Ok(())
    }
}

// ── Private helpers ───────────────────────────────────────────────────────────

fn canonical_pair(a: &Address, b: &Address) -> (Address, Address) {
    if a < b { (a.clone(), b.clone()) } else { (b.clone(), a.clone()) }
}

fn make_salt(e: &Env, counter: u32) -> BytesN<32> {
    let mut s = [0u8; 32];
    s[..4].copy_from_slice(&counter.to_be_bytes());
    BytesN::from_array(e, &s)
}
