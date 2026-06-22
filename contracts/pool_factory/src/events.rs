use soroban_sdk::{symbol_short, Address, BytesN, Env};

pub fn emit_pool_created(
    e: &Env,
    creator: &Address,
    pool: &Address,
    token_a: &Address,
    token_b: &Address,
    amp: u64,
    fee_bps: u32,
) {
    e.events().publish(
        (symbol_short!("pool_new"), creator),
        (pool, token_a, token_b, amp, fee_bps),
    );
}

pub fn emit_wasm_hash_updated(
    e: &Env,
    admin: &Address,
    old: BytesN<32>,
    new: BytesN<32>,
) {
    e.events()
        .publish((symbol_short!("wasm_upd"), admin), (old, new));
}
