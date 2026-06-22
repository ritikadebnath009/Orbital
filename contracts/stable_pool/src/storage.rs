use soroban_sdk::{contracttype, Address, Env};

// CRIT-1 fix: TTL extended from 2 days → 180 days (instance) / 365 days (persistent).
// Short TTLs allowed dormant-pool re-initialization attacks.
const INSTANCE_LEDGER_BUMP: u32 = 3_110_400; // ~180 days at 5 s/ledger
const INSTANCE_LEDGER_TTL:  u32 = 2_592_000; // ~150 days
const PERSISTENT_LEDGER_BUMP: u32 = 6_307_200; // ~365 days
const PERSISTENT_LEDGER_TTL:  u32 = 5_184_000; // ~300 days

#[contracttype]
#[derive(Clone)]
pub enum InstanceKey {
    TokenA,
    TokenB,
    AmpInitial,
    AmpInitialTime,
    AmpFuture,
    AmpFutureTime,
    FeeBps,
    Paused,
    Admin,
    ProtocolFeeBps,
    FeeRecipient,
    AccruedFeeA,
    AccruedFeeB,
    // MED-5: two-step admin transfer
    PendingAdmin,
    // HIGH-5: upgrade timelock
    PendingUpgradeHash,
    PendingUpgradeTime,
}

#[contracttype]
#[derive(Clone)]
pub enum PersistentKey {
    ReserveA,
    ReserveB,
    TotalShares,
    UserShares(Address),
}

pub struct PoolState {
    pub reserve_a: i128,
    pub reserve_b: i128,
    pub amp: u64,
    pub fee_bps: u32,
    pub total_shares: i128,
    pub token_a: Address,
    pub token_b: Address,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct RampState {
    pub initial_a: u64,
    pub initial_a_time: u64,
    pub future_a: u64,
    pub future_a_time: u64,
}

// ── Instance storage helpers ──────────────────────────────────────────────────

pub fn write_token_a(e: &Env, addr: &Address) {
    e.storage().instance().set(&InstanceKey::TokenA, addr);
    bump_instance(e);
}

pub fn read_token_a(e: &Env) -> Address {
    bump_instance(e);
    e.storage().instance().get(&InstanceKey::TokenA).unwrap()
}

pub fn write_token_b(e: &Env, addr: &Address) {
    e.storage().instance().set(&InstanceKey::TokenB, addr);
    bump_instance(e);
}

pub fn read_token_b(e: &Env) -> Address {
    bump_instance(e);
    e.storage().instance().get(&InstanceKey::TokenB).unwrap()
}

pub fn write_amp_static(e: &Env, amp: u64) {
    let now = e.ledger().timestamp();
    e.storage().instance().set(&InstanceKey::AmpInitial, &amp);
    e.storage().instance().set(&InstanceKey::AmpInitialTime, &now);
    e.storage().instance().set(&InstanceKey::AmpFuture, &amp);
    e.storage().instance().set(&InstanceKey::AmpFutureTime, &now);
    bump_instance(e);
}

pub fn write_amp_ramp(e: &Env, current_a: u64, future_a: u64, future_a_time: u64) {
    let now = e.ledger().timestamp();
    e.storage().instance().set(&InstanceKey::AmpInitial, &current_a);
    e.storage().instance().set(&InstanceKey::AmpInitialTime, &now);
    e.storage().instance().set(&InstanceKey::AmpFuture, &future_a);
    e.storage().instance().set(&InstanceKey::AmpFutureTime, &future_a_time);
    bump_instance(e);
}

pub fn read_ramp_state(e: &Env) -> RampState {
    bump_instance(e);
    RampState {
        initial_a:      e.storage().instance().get(&InstanceKey::AmpInitial).unwrap(),
        initial_a_time: e.storage().instance().get(&InstanceKey::AmpInitialTime).unwrap(),
        future_a:       e.storage().instance().get(&InstanceKey::AmpFuture).unwrap(),
        future_a_time:  e.storage().instance().get(&InstanceKey::AmpFutureTime).unwrap(),
    }
}

pub fn current_amp(e: &Env) -> u64 {
    let ramp = read_ramp_state(e);
    let now  = e.ledger().timestamp();
    if now >= ramp.future_a_time {
        return ramp.future_a;
    }
    if now <= ramp.initial_a_time || ramp.future_a_time == ramp.initial_a_time {
        return ramp.initial_a;
    }
    let a0      = ramp.initial_a as i128;
    let a1      = ramp.future_a as i128;
    let elapsed = (now - ramp.initial_a_time) as i128;
    let total   = (ramp.future_a_time - ramp.initial_a_time) as i128;
    (a0 + (a1 - a0) * elapsed / total) as u64
}

pub fn write_fee_bps(e: &Env, fee: u32) {
    e.storage().instance().set(&InstanceKey::FeeBps, &fee);
    bump_instance(e);
}

pub fn read_fee_bps(e: &Env) -> u32 {
    bump_instance(e);
    e.storage().instance().get(&InstanceKey::FeeBps).unwrap()
}

pub fn write_paused(e: &Env, paused: bool) {
    e.storage().instance().set(&InstanceKey::Paused, &paused);
    bump_instance(e);
}

pub fn read_paused(e: &Env) -> bool {
    bump_instance(e);
    e.storage().instance().get(&InstanceKey::Paused).unwrap_or(false)
}

pub fn write_admin(e: &Env, admin: &Address) {
    e.storage().instance().set(&InstanceKey::Admin, admin);
    bump_instance(e);
}

pub fn read_admin(e: &Env) -> Address {
    bump_instance(e);
    e.storage().instance().get(&InstanceKey::Admin).unwrap()
}

pub fn is_initialized(e: &Env) -> bool {
    e.storage().instance().has(&InstanceKey::Admin)
}

// ── Two-step admin transfer (MED-5) ──────────────────────────────────────────

pub fn write_pending_admin(e: &Env, admin: &Address) {
    e.storage().instance().set(&InstanceKey::PendingAdmin, admin);
    bump_instance(e);
}

pub fn read_pending_admin(e: &Env) -> Option<Address> {
    bump_instance(e);
    e.storage().instance().get(&InstanceKey::PendingAdmin)
}

pub fn clear_pending_admin(e: &Env) {
    e.storage().instance().remove(&InstanceKey::PendingAdmin);
    bump_instance(e);
}

// ── Upgrade timelock (HIGH-5) ─────────────────────────────────────────────────

pub fn write_pending_upgrade(e: &Env, wasm_hash: &soroban_sdk::BytesN<32>, execute_after: u64) {
    e.storage().instance().set(&InstanceKey::PendingUpgradeHash, wasm_hash);
    e.storage().instance().set(&InstanceKey::PendingUpgradeTime, &execute_after);
    bump_instance(e);
}

pub fn read_pending_upgrade(e: &Env) -> Option<(soroban_sdk::BytesN<32>, u64)> {
    bump_instance(e);
    let hash: Option<soroban_sdk::BytesN<32>> = e.storage().instance().get(&InstanceKey::PendingUpgradeHash);
    let time: Option<u64> = e.storage().instance().get(&InstanceKey::PendingUpgradeTime);
    match (hash, time) {
        (Some(h), Some(t)) => Some((h, t)),
        _ => None,
    }
}

pub fn clear_pending_upgrade(e: &Env) {
    e.storage().instance().remove(&InstanceKey::PendingUpgradeHash);
    e.storage().instance().remove(&InstanceKey::PendingUpgradeTime);
    bump_instance(e);
}

// ── Protocol fee helpers ──────────────────────────────────────────────────────

pub fn write_protocol_fee(e: &Env, fee_bps: u32, recipient: &Address) {
    e.storage().instance().set(&InstanceKey::ProtocolFeeBps, &fee_bps);
    e.storage().instance().set(&InstanceKey::FeeRecipient, recipient);
    bump_instance(e);
}

pub fn read_protocol_fee_bps(e: &Env) -> u32 {
    e.storage().instance().get(&InstanceKey::ProtocolFeeBps).unwrap_or(0u32)
}

pub fn read_fee_recipient(e: &Env) -> Option<Address> {
    e.storage().instance().get(&InstanceKey::FeeRecipient)
}

pub fn accrue_protocol_fee(e: &Env, token_a_fee: i128, token_b_fee: i128) {
    let prev_a: i128 = e.storage().instance().get(&InstanceKey::AccruedFeeA).unwrap_or(0i128);
    let prev_b: i128 = e.storage().instance().get(&InstanceKey::AccruedFeeB).unwrap_or(0i128);
    e.storage().instance().set(&InstanceKey::AccruedFeeA, &(prev_a + token_a_fee));
    e.storage().instance().set(&InstanceKey::AccruedFeeB, &(prev_b + token_b_fee));
    bump_instance(e);
}

pub fn read_accrued_fees(e: &Env) -> (i128, i128) {
    let a: i128 = e.storage().instance().get(&InstanceKey::AccruedFeeA).unwrap_or(0i128);
    let b: i128 = e.storage().instance().get(&InstanceKey::AccruedFeeB).unwrap_or(0i128);
    (a, b)
}

pub fn clear_accrued_fees(e: &Env) {
    e.storage().instance().set(&InstanceKey::AccruedFeeA, &0i128);
    e.storage().instance().set(&InstanceKey::AccruedFeeB, &0i128);
    bump_instance(e);
}

// ── Persistent storage helpers ────────────────────────────────────────────────

pub fn write_reserve_a(e: &Env, amount: i128) {
    e.storage().persistent().set(&PersistentKey::ReserveA, &amount);
    bump_persistent(e, &PersistentKey::ReserveA);
}

pub fn read_reserve_a(e: &Env) -> i128 {
    bump_persistent(e, &PersistentKey::ReserveA);
    e.storage().persistent().get(&PersistentKey::ReserveA).unwrap_or(0)
}

pub fn write_reserve_b(e: &Env, amount: i128) {
    e.storage().persistent().set(&PersistentKey::ReserveB, &amount);
    bump_persistent(e, &PersistentKey::ReserveB);
}

pub fn read_reserve_b(e: &Env) -> i128 {
    bump_persistent(e, &PersistentKey::ReserveB);
    e.storage().persistent().get(&PersistentKey::ReserveB).unwrap_or(0)
}

pub fn write_total_shares(e: &Env, shares: i128) {
    e.storage().persistent().set(&PersistentKey::TotalShares, &shares);
    bump_persistent(e, &PersistentKey::TotalShares);
}

pub fn read_total_shares(e: &Env) -> i128 {
    bump_persistent(e, &PersistentKey::TotalShares);
    e.storage().persistent().get(&PersistentKey::TotalShares).unwrap_or(0)
}

pub fn write_user_shares(e: &Env, user: &Address, shares: i128) {
    let key = PersistentKey::UserShares(user.clone());
    if shares == 0 {
        e.storage().persistent().remove(&key);
    } else {
        e.storage().persistent().set(&key, &shares);
        bump_persistent(e, &key);
    }
}

pub fn read_user_shares(e: &Env, user: &Address) -> i128 {
    let key = PersistentKey::UserShares(user.clone());
    if e.storage().persistent().has(&key) {
        bump_persistent(e, &key);
        e.storage().persistent().get(&key).unwrap_or(0)
    } else {
        0
    }
}

pub fn read_pool_state(e: &Env) -> PoolState {
    PoolState {
        reserve_a:    read_reserve_a(e),
        reserve_b:    read_reserve_b(e),
        amp:          current_amp(e),
        fee_bps:      read_fee_bps(e),
        total_shares: read_total_shares(e),
        token_a:      read_token_a(e),
        token_b:      read_token_b(e),
    }
}

// ── TTL bump helpers ──────────────────────────────────────────────────────────

fn bump_instance(e: &Env) {
    e.storage().instance().extend_ttl(INSTANCE_LEDGER_TTL, INSTANCE_LEDGER_BUMP);
}

fn bump_persistent(e: &Env, key: &PersistentKey) {
    e.storage().persistent().extend_ttl(key, PERSISTENT_LEDGER_TTL, PERSISTENT_LEDGER_BUMP);
}
