#![cfg(test)]
extern crate std;

use soroban_sdk::{
    testutils::Address as _,
    token::StellarAssetClient,
    Address, BytesN, Env,
};

use crate::{FactoryError, PoolFactory, PoolFactoryClient};

// Import stable_pool contract WASM for deployment tests.
// Requires `stellar contract build` to have been run first.
mod pool_wasm {
    soroban_sdk::contractimport!(
        file = "../target/wasm32v1-none/release/stable_pool.wasm"
    );
}

fn new_sac(env: &Env) -> Address {
    let admin = Address::generate(env);
    env.register_stellar_asset_contract_v2(admin).address()
}

fn deploy_factory(env: &Env) -> PoolFactoryClient {
    let id = env.register(PoolFactory, ());
    PoolFactoryClient::new(env, &id)
}

// ── Initialization ────────────────────────────────────────────────────────────

#[test]
fn test_initialize() {
    let env = Env::default();
    env.mock_all_auths();
    let factory = deploy_factory(&env);
    let admin = Address::generate(&env);
    let wasm_hash = env.deployer().upload_contract_wasm(pool_wasm::WASM);
    factory.initialize(&admin, &wasm_hash);
    assert_eq!(factory.pool_count(), 0u32);
    assert_eq!(factory.get_all_pools().len(), 0u32);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_double_initialize_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let factory = deploy_factory(&env);
    let admin = Address::generate(&env);
    let wasm_hash = env.deployer().upload_contract_wasm(pool_wasm::WASM);
    factory.initialize(&admin, &wasm_hash);
    factory.initialize(&admin, &wasm_hash);
}

// ── Pool creation ─────────────────────────────────────────────────────────────

#[test]
fn test_create_pool_and_lookup() {
    let env = Env::default();
    env.mock_all_auths();
    let factory = deploy_factory(&env);
    let admin = Address::generate(&env);
    let wasm_hash = env.deployer().upload_contract_wasm(pool_wasm::WASM);
    factory.initialize(&admin, &wasm_hash);

    let usdc = new_sac(&env);
    let usdt = new_sac(&env);
    let creator = Address::generate(&env);

    let pool_addr = factory.create_pool(&creator, &usdc, &usdt, &100u64, &4u32);

    assert_eq!(factory.pool_count(), 1u32);

    // Order-insensitive lookup
    assert_eq!(factory.get_pool(&usdc, &usdt).unwrap(), pool_addr);
    assert_eq!(factory.get_pool(&usdt, &usdc).unwrap(), pool_addr);

    // PoolInfo
    let info = factory.get_pool_info(&usdc, &usdt);
    assert_eq!(info.address, pool_addr);
    assert_eq!(info.amp, 100u64);
    assert_eq!(info.fee_bps, 4u32);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_duplicate_pool_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let factory = deploy_factory(&env);
    let admin = Address::generate(&env);
    let wasm_hash = env.deployer().upload_contract_wasm(pool_wasm::WASM);
    factory.initialize(&admin, &wasm_hash);

    let usdc = new_sac(&env);
    let usdt = new_sac(&env);
    let creator = Address::generate(&env);
    factory.create_pool(&creator, &usdc, &usdt, &100u64, &4u32);
    factory.create_pool(&creator, &usdt, &usdc, &200u64, &4u32); // same pair reversed
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_same_token_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let factory = deploy_factory(&env);
    let admin = Address::generate(&env);
    let wasm_hash = env.deployer().upload_contract_wasm(pool_wasm::WASM);
    factory.initialize(&admin, &wasm_hash);

    let usdc = new_sac(&env);
    let creator = Address::generate(&env);
    factory.create_pool(&creator, &usdc, &usdc, &100u64, &4u32);
}

#[test]
fn test_multiple_pools() {
    let env = Env::default();
    env.mock_all_auths();
    let factory = deploy_factory(&env);
    let admin = Address::generate(&env);
    let wasm_hash = env.deployer().upload_contract_wasm(pool_wasm::WASM);
    factory.initialize(&admin, &wasm_hash);

    let creator = Address::generate(&env);
    let usdc = new_sac(&env);
    let usdt = new_sac(&env);
    let eurc = new_sac(&env);

    let p1 = factory.create_pool(&creator, &usdc, &usdt, &100u64, &4u32);
    let p2 = factory.create_pool(&creator, &usdc, &eurc, &100u64, &4u32);
    let p3 = factory.create_pool(&creator, &usdt, &eurc, &200u64, &4u32);

    assert_eq!(factory.pool_count(), 3u32);
    assert_eq!(factory.get_all_pools().len(), 3u32);

    // All three pools are distinct
    assert_ne!(p1, p2);
    assert_ne!(p2, p3);
    assert_ne!(p1, p3);
}

#[test]
fn test_deployed_pool_is_functional() {
    let env = Env::default();
    env.mock_all_auths();
    let factory = deploy_factory(&env);
    let admin = Address::generate(&env);
    let wasm_hash = env.deployer().upload_contract_wasm(pool_wasm::WASM);
    factory.initialize(&admin, &wasm_hash);

    let usdc_admin = Address::generate(&env);
    let usdt_admin = Address::generate(&env);
    let usdc = env.register_stellar_asset_contract_v2(usdc_admin).address();
    let usdt = env.register_stellar_asset_contract_v2(usdt_admin).address();

    let creator = Address::generate(&env);
    let pool_addr = factory.create_pool(&creator, &usdc, &usdt, &100u64, &4u32);

    // Pool initialized correctly
    let pool = pool_wasm::Client::new(&env, &pool_addr);
    assert_eq!(pool.get_amp(), 100u64);
    assert_eq!(pool.get_fee_bps(), 4u32);

    // Pool accepts liquidity
    let lp = Address::generate(&env);
    let amt = 10_000 * 10_000_000i128;
    StellarAssetClient::new(&env, &usdc).mint(&lp, &amt);
    StellarAssetClient::new(&env, &usdt).mint(&lp, &amt);
    let shares = pool.add_liquidity(&lp, &amt, &amt, &1i128);
    assert!(shares > 0);
}

#[test]
fn test_nonexistent_pool_returns_none() {
    let env = Env::default();
    env.mock_all_auths();
    let factory = deploy_factory(&env);
    let admin = Address::generate(&env);
    let wasm_hash = env.deployer().upload_contract_wasm(pool_wasm::WASM);
    factory.initialize(&admin, &wasm_hash);

    let usdc = new_sac(&env);
    let usdt = new_sac(&env);
    assert!(factory.get_pool(&usdc, &usdt).is_none());
}
