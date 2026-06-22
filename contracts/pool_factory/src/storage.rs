use soroban_sdk::{contracttype, Address, BytesN, Env, Vec};
use crate::PoolInfo;

// CRIT-1 fix: TTL extended to 180 days (instance) / 365 days (persistent).
const BUMP: u32 = 3_110_400; // ~180 days
const TTL:  u32 = 2_592_000; // ~150 days
const PERSISTENT_BUMP: u32 = 6_307_200; // ~365 days
const PERSISTENT_TTL:  u32 = 5_184_000; // ~300 days

#[contracttype]
#[derive(Clone)]
enum InstanceKey {
    Admin,
    PoolWasmHash,
    PoolCount,
    PoolsVec,
    // MED-5: two-step admin transfer
    PendingAdmin,
    // HIGH-5: upgrade timelock
    PendingUpgradeHash,
    PendingUpgradeTime,
}

#[contracttype]
#[derive(Clone)]
enum PersistentKey {
    PoolByPair(Address, Address),
}

// ── Instance storage ──────────────────────────────────────────────────────────

pub fn write_admin(e: &Env, admin: &Address) {
    e.storage().instance().set(&InstanceKey::Admin, admin);
    bump(e);
}
pub fn read_admin(e: &Env) -> Address {
    bump(e);
    e.storage().instance().get(&InstanceKey::Admin).unwrap()
}

pub fn write_pool_wasm_hash(e: &Env, h: &BytesN<32>) {
    e.storage().instance().set(&InstanceKey::PoolWasmHash, h);
    bump(e);
}
pub fn read_pool_wasm_hash(e: &Env) -> BytesN<32> {
    bump(e);
    e.storage().instance().get(&InstanceKey::PoolWasmHash).unwrap()
}

pub fn is_initialized(e: &Env) -> bool {
    e.storage().instance().has(&InstanceKey::Admin)
}

pub fn read_pool_count(e: &Env) -> u32 {
    e.storage().instance().get(&InstanceKey::PoolCount).unwrap_or(0)
}

fn inc_pool_count(e: &Env) {
    let n = read_pool_count(e);
    e.storage().instance().set(&InstanceKey::PoolCount, &(n + 1));
}

pub fn read_pools_vec(e: &Env) -> Vec<Address> {
    bump(e);
    e.storage()
        .instance()
        .get(&InstanceKey::PoolsVec)
        .unwrap_or_else(|| Vec::new(e))
}

fn push_pool_vec(e: &Env, pool: &Address) {
    let mut v = read_pools_vec(e);
    v.push_back(pool.clone());
    e.storage().instance().set(&InstanceKey::PoolsVec, &v);
}

// ── Two-step admin transfer (MED-5) ──────────────────────────────────────────

pub fn write_pending_admin(e: &Env, admin: &Address) {
    e.storage().instance().set(&InstanceKey::PendingAdmin, admin);
    bump(e);
}
pub fn read_pending_admin(e: &Env) -> Option<Address> {
    bump(e);
    e.storage().instance().get(&InstanceKey::PendingAdmin)
}
pub fn clear_pending_admin(e: &Env) {
    e.storage().instance().remove(&InstanceKey::PendingAdmin);
    bump(e);
}

// ── Upgrade timelock (HIGH-5) ─────────────────────────────────────────────────

pub fn write_pending_upgrade(e: &Env, wasm_hash: &BytesN<32>, execute_after: u64) {
    e.storage().instance().set(&InstanceKey::PendingUpgradeHash, wasm_hash);
    e.storage().instance().set(&InstanceKey::PendingUpgradeTime, &execute_after);
    bump(e);
}
pub fn read_pending_upgrade(e: &Env) -> Option<(BytesN<32>, u64)> {
    bump(e);
    let hash: Option<BytesN<32>> = e.storage().instance().get(&InstanceKey::PendingUpgradeHash);
    let time: Option<u64> = e.storage().instance().get(&InstanceKey::PendingUpgradeTime);
    match (hash, time) {
        (Some(h), Some(t)) => Some((h, t)),
        _ => None,
    }
}
pub fn clear_pending_upgrade(e: &Env) {
    e.storage().instance().remove(&InstanceKey::PendingUpgradeHash);
    e.storage().instance().remove(&InstanceKey::PendingUpgradeTime);
    bump(e);
}

// ── Persistent storage ────────────────────────────────────────────────────────

pub fn write_pool_entry(
    e: &Env,
    token_a: &Address,
    token_b: &Address,
    pool: &Address,
    amp: u64,
    fee_bps: u32,
    _idx: u32,
) {
    let info = PoolInfo {
        address: pool.clone(),
        token_a: token_a.clone(),
        token_b: token_b.clone(),
        amp,
        fee_bps,
    };
    let key = PersistentKey::PoolByPair(token_a.clone(), token_b.clone());
    e.storage().persistent().set(&key, &info);
    e.storage().persistent().extend_ttl(&key, PERSISTENT_TTL, PERSISTENT_BUMP);

    push_pool_vec(e, pool);
    inc_pool_count(e);
    bump(e);
}

pub fn read_pool_by_pair(e: &Env, token_a: &Address, token_b: &Address) -> Option<Address> {
    let key = PersistentKey::PoolByPair(token_a.clone(), token_b.clone());
    let info: Option<PoolInfo> = e.storage().persistent().get(&key);
    if let Some(i) = info {
        e.storage().persistent().extend_ttl(&key, PERSISTENT_TTL, PERSISTENT_BUMP);
        Some(i.address)
    } else {
        None
    }
}

pub fn read_pool_info(e: &Env, token_a: &Address, token_b: &Address) -> Option<PoolInfo> {
    let key = PersistentKey::PoolByPair(token_a.clone(), token_b.clone());
    let info: Option<PoolInfo> = e.storage().persistent().get(&key);
    if info.is_some() {
        e.storage().persistent().extend_ttl(&key, PERSISTENT_TTL, PERSISTENT_BUMP);
    }
    info
}

fn bump(e: &Env) {
    e.storage().instance().extend_ttl(TTL, BUMP);
}
