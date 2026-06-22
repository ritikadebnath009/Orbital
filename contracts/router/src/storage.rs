use soroban_sdk::{contracttype, Address, Env};

// CRIT-1 fix: TTL extended to 180 days.
const BUMP: u32 = 3_110_400; // ~180 days
const TTL:  u32 = 2_592_000; // ~150 days

#[contracttype]
enum Key {
    Factory,
}

pub fn write_factory(e: &Env, factory: &Address) {
    e.storage().instance().set(&Key::Factory, factory);
    bump(e);
}

pub fn read_factory(e: &Env) -> Address {
    bump(e);
    e.storage().instance().get(&Key::Factory).unwrap()
}

pub fn is_initialized(e: &Env) -> bool {
    e.storage().instance().has(&Key::Factory)
}

fn bump(e: &Env) {
    e.storage().instance().extend_ttl(TTL, BUMP);
}
