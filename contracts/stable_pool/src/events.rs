use soroban_sdk::{symbol_short, Address, Env};

/// Emitted when a user adds liquidity to the pool.
pub fn emit_add_liquidity(
    e: &Env,
    provider: &Address,
    amount_a: i128,
    amount_b: i128,
    shares_minted: i128,
    reserve_a: i128,
    reserve_b: i128,
) {
    e.events().publish(
        (symbol_short!("add_liq"), provider),
        (amount_a, amount_b, shares_minted, reserve_a, reserve_b),
    );
}

/// Emitted when a user removes liquidity from the pool.
pub fn emit_remove_liquidity(
    e: &Env,
    provider: &Address,
    shares_burned: i128,
    amount_a: i128,
    amount_b: i128,
    reserve_a: i128,
    reserve_b: i128,
) {
    e.events().publish(
        (symbol_short!("rm_liq"), provider),
        (shares_burned, amount_a, amount_b, reserve_a, reserve_b),
    );
}

/// Emitted on every swap.
pub fn emit_swap(
    e: &Env,
    user: &Address,
    token_in: &Address,
    token_out: &Address,
    amount_in: i128,
    amount_out: i128,
    fee: i128,
    reserve_a: i128,
    reserve_b: i128,
) {
    e.events().publish(
        (symbol_short!("swap"), user),
        (token_in, token_out, amount_in, amount_out, fee, reserve_a, reserve_b),
    );
}

/// Emitted when the pool pause state changes.
pub fn emit_pause(e: &Env, admin: &Address, paused: bool) {
    e.events()
        .publish((symbol_short!("pause"), admin), (paused,));
}

/// Emitted when amplification coefficient is updated.
pub fn emit_amp_update(e: &Env, admin: &Address, old_amp: u64, new_amp: u64) {
    e.events()
        .publish((symbol_short!("amp_upd"), admin), (old_amp, new_amp));
}
