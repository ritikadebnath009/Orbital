#![cfg(test)]
extern crate std;

use soroban_sdk::{
    testutils::Address as _,
    token::StellarAssetClient,
    Address, Env,
};

use crate::{Router, RouterClient};

mod pool_wasm {
    soroban_sdk::contractimport!(
        file = "../target/wasm32v1-none/release/stable_pool.wasm"
    );
}

mod factory_wasm {
    soroban_sdk::contractimport!(
        file = "../target/wasm32v1-none/release/pool_factory.wasm"
    );
}

const PRECISION: i128 = 10_000_000;
const POOL_SIZE: i128 = 1_000_000 * 10_000_000;

fn new_sac(env: &Env) -> Address {
    let admin = Address::generate(env);
    env.register_stellar_asset_contract_v2(admin).address()
}

fn mint(env: &Env, token: &Address, to: &Address, amount: i128) {
    // We need to get the admin for this SAC to mint. In tests, mock_all_auths handles this.
    StellarAssetClient::new(env, token).mint(to, &amount);
}

struct TestSetup<'a> {
    env: Env,
    router: RouterClient<'a>,
    factory: factory_wasm::Client<'a>,
    usdc: Address,
    usdt: Address,
    eurc: Address,
    pool_usdc_usdt: Address,
    pool_usdc_eurc: Address,
    pool_usdt_eurc: Address,
}

fn setup() -> TestSetup<'static> {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();
    env.cost_estimate().budget().reset_unlimited();

    // Upload WASMs
    let pool_hash = env.deployer().upload_contract_wasm(pool_wasm::WASM);
    let _factory_hash = env.deployer().upload_contract_wasm(factory_wasm::WASM);

    // Deploy factory
    let factory_id = env.register(pool_factory::PoolFactory, ());
    let factory_admin = Address::generate(&env);
    let factory_client = factory_wasm::Client::new(&env, &factory_id);
    factory_client.initialize(&factory_admin, &pool_hash);

    // Deploy router
    let router_id = env.register(Router, ());
    let router = RouterClient::new(&env, &router_id);
    router.initialize(&factory_id);

    // Create tokens
    let usdc = new_sac(&env);
    let usdt = new_sac(&env);
    let eurc = new_sac(&env);

    let creator = Address::generate(&env);

    // Deploy three pools
    let pool_usdc_usdt = factory_client.create_pool(&creator, &usdc, &usdt, &100u64, &4u32);
    let pool_usdc_eurc = factory_client.create_pool(&creator, &usdc, &eurc, &100u64, &4u32);
    let pool_usdt_eurc = factory_client.create_pool(&creator, &usdt, &eurc, &100u64, &4u32);

    // Seed all pools with liquidity
    let lp = Address::generate(&env);
    for token in [&usdc, &usdt, &eurc] {
        mint(&env, token, &lp, POOL_SIZE * 3);
    }

    let usdc_usdt = pool_wasm::Client::new(&env, &pool_usdc_usdt);
    let usdc_eurc = pool_wasm::Client::new(&env, &pool_usdc_eurc);
    let usdt_eurc = pool_wasm::Client::new(&env, &pool_usdt_eurc);

    usdc_usdt.add_liquidity(&lp, &POOL_SIZE, &POOL_SIZE, &1i128);
    usdc_eurc.add_liquidity(&lp, &POOL_SIZE, &POOL_SIZE, &1i128);
    usdt_eurc.add_liquidity(&lp, &POOL_SIZE, &POOL_SIZE, &1i128);

    // Safety: transmute to 'static for test struct (env lives on stack)
    unsafe {
        TestSetup {
            env: env.clone(),
            router: core::mem::transmute(router),
            factory: core::mem::transmute(factory_client),
            usdc,
            usdt,
            eurc,
            pool_usdc_usdt,
            pool_usdc_eurc,
            pool_usdt_eurc,
        }
    }
}

// ── Router initialization ─────────────────────────────────────────────────────

#[test]
fn test_router_initialize() {
    let t = setup();
    let factory = t.router.get_factory();
    // factory should be set
    assert_ne!(factory, Address::generate(&t.env));
}

// ── Quote: 1-hop ──────────────────────────────────────────────────────────────

#[test]
fn test_quote_direct_pool() {
    let t = setup();
    let amount_in = 1_000 * PRECISION;
    let q = t.router.get_quote(&t.usdc, &t.usdt, &amount_in);
    assert_eq!(q.route.hops, 1u32);
    assert!(q.amount_out > 0);
    // For stablecoin pool, output should be close to input (minus fee)
    assert!(q.amount_out > amount_in * 9990 / 10000);
}

// ── Quote: 2-hop ──────────────────────────────────────────────────────────────

#[test]
fn test_quote_two_hop_usdc_eurc_via_usdt() {
    // Remove USDC/EURC pool to force 2-hop routing
    // In this test, we only set up USDC/USDT and USDT/EURC — no direct USDC/EURC

    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();
    env.cost_estimate().budget().reset_unlimited();

    let pool_hash = env.deployer().upload_contract_wasm(pool_wasm::WASM);

    let factory_id = env.register(pool_factory::PoolFactory, ());
    let factory_admin = Address::generate(&env);
    let factory_client = factory_wasm::Client::new(&env, &factory_id);
    factory_client.initialize(&factory_admin, &pool_hash);

    let router_id = env.register(Router, ());
    let router = RouterClient::new(&env, &router_id);
    router.initialize(&factory_id);

    let usdc = new_sac(&env);
    let usdt = new_sac(&env);
    let eurc = new_sac(&env);
    let creator = Address::generate(&env);

    // Only USDC↔USDT and USDT↔EURC pools (no USDC↔EURC)
    let pool1 = factory_client.create_pool(&creator, &usdc, &usdt, &100u64, &4u32);
    let pool2 = factory_client.create_pool(&creator, &usdt, &eurc, &100u64, &4u32);

    let lp = Address::generate(&env);
    for t in [&usdc, &usdt, &eurc] {
        StellarAssetClient::new(&env, t).mint(&lp, &(POOL_SIZE * 2));
    }
    pool_wasm::Client::new(&env, &pool1).add_liquidity(&lp, &POOL_SIZE, &POOL_SIZE, &1i128);
    pool_wasm::Client::new(&env, &pool2).add_liquidity(&lp, &POOL_SIZE, &POOL_SIZE, &1i128);

    let amount_in = 1_000 * PRECISION;
    let q = router.get_quote(&usdc, &eurc, &amount_in);
    assert_eq!(q.route.hops, 2u32);
    assert!(q.amount_out > 0);
    // 2-hop: ~2x fee loss (~8 bps total)
    assert!(q.amount_out > amount_in * 9980 / 10000);
}

// ── Swap execution: 1-hop ─────────────────────────────────────────────────────

#[test]
fn test_swap_direct() {
    let t = setup();
    let trader = Address::generate(&t.env);
    let amount_in = 500 * PRECISION;
    mint(&t.env, &t.usdc, &trader, amount_in);

    let deadline = t.env.ledger().sequence() + 100;
    let received = t.router.swap(
        &trader,
        &t.usdc,
        &t.usdt,
        &amount_in,
        &1i128,
        &deadline,
    );

    assert!(received > 0);
    assert!(received < amount_in); // fee deducted
    // Trader got USDT, spent all USDC
    assert_eq!(
        soroban_sdk::token::TokenClient::new(&t.env, &t.usdt).balance(&trader),
        received
    );
    assert_eq!(
        soroban_sdk::token::TokenClient::new(&t.env, &t.usdc).balance(&trader),
        0
    );
}

// ── Swap execution: 2-hop ─────────────────────────────────────────────────────

#[test]
fn test_swap_two_hop() {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();
    env.cost_estimate().budget().reset_unlimited();

    let pool_hash = env.deployer().upload_contract_wasm(pool_wasm::WASM);
    let factory_id = env.register(pool_factory::PoolFactory, ());
    let factory_admin = Address::generate(&env);
    factory_wasm::Client::new(&env, &factory_id).initialize(&factory_admin, &pool_hash);

    let router_id = env.register(Router, ());
    let router = RouterClient::new(&env, &router_id);
    router.initialize(&factory_id);

    let usdc = new_sac(&env);
    let usdt = new_sac(&env);
    let eurc = new_sac(&env);
    let creator = Address::generate(&env);

    let factory = factory_wasm::Client::new(&env, &factory_id);
    let p1 = factory.create_pool(&creator, &usdc, &usdt, &100u64, &4u32);
    let p2 = factory.create_pool(&creator, &usdt, &eurc, &100u64, &4u32);

    let lp = Address::generate(&env);
    for t in [&usdc, &usdt, &eurc] {
        StellarAssetClient::new(&env, t).mint(&lp, &(POOL_SIZE * 2));
    }
    pool_wasm::Client::new(&env, &p1).add_liquidity(&lp, &POOL_SIZE, &POOL_SIZE, &1i128);
    pool_wasm::Client::new(&env, &p2).add_liquidity(&lp, &POOL_SIZE, &POOL_SIZE, &1i128);

    let trader = Address::generate(&env);
    let amount_in = 1_000 * PRECISION;
    StellarAssetClient::new(&env, &usdc).mint(&trader, &amount_in);

    let deadline = env.ledger().sequence() + 100;
    let received = router.swap(&trader, &usdc, &eurc, &amount_in, &1i128, &deadline);

    assert!(received > 0);
    // 2-hop ≈ 8 bps fee loss
    assert!(received > amount_in * 9980 / 10000);
    assert_eq!(soroban_sdk::token::TokenClient::new(&env, &eurc).balance(&trader), received);
    assert_eq!(soroban_sdk::token::TokenClient::new(&env, &usdc).balance(&trader), 0);
}

// ── Error cases ───────────────────────────────────────────────────────────────

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_no_route_fails() {
    let t = setup();
    let random = new_sac(&t.env);
    t.router.get_quote(&t.usdc, &random, &(100 * PRECISION));
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn test_expired_deadline_fails() {
    let t = setup();
    let trader = Address::generate(&t.env);
    let amount_in = 100 * PRECISION;
    mint(&t.env, &t.usdc, &trader, amount_in);
    // deadline in the past
    t.router.swap(&trader, &t.usdc, &t.usdt, &amount_in, &1i128, &0u32);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_slippage_exceeded_fails() {
    let t = setup();
    let trader = Address::generate(&t.env);
    let amount_in = 100 * PRECISION;
    mint(&t.env, &t.usdc, &trader, amount_in);
    let deadline = t.env.ledger().sequence() + 100;
    // Require more output than possible
    t.router.swap(&trader, &t.usdc, &t.usdt, &amount_in, &amount_in, &deadline);
}

// ── LOW-4: collect_intermediates with more candidates than MAX_INTERMEDIATES ──

// Regression test for the collect_intermediates early-break fix: previously
// every registered pool was scanned regardless of how many valid
// intermediates had already been found, an O(n)-in-total-pool-count cost.
// The early break must never cause a valid route to be missed — build more
// candidate intermediate tokens (11) than MAX_INTERMEDIATES (8) and confirm
// routing still finds a working 2-hop path.
#[test]
fn test_routing_scales_past_max_intermediates() {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();
    env.cost_estimate().budget().reset_unlimited();

    let pool_hash = env.deployer().upload_contract_wasm(pool_wasm::WASM);
    let factory_id = env.register(pool_factory::PoolFactory, ());
    let factory_admin = Address::generate(&env);
    let factory_client = factory_wasm::Client::new(&env, &factory_id);
    factory_client.initialize(&factory_admin, &pool_hash);

    let router_id = env.register(Router, ());
    let router = RouterClient::new(&env, &router_id);
    router.initialize(&factory_id);

    let usdc = new_sac(&env);
    let usdt = new_sac(&env);
    let creator = Address::generate(&env);
    let lp = Address::generate(&env);

    StellarAssetClient::new(&env, &usdc).mint(&lp, &(POOL_SIZE * 20));
    StellarAssetClient::new(&env, &usdt).mint(&lp, &(POOL_SIZE * 20));

    // 11 unrelated intermediate candidates, each pooled with both usdc and
    // usdt — more than MAX_INTERMEDIATES (8), so the cap must actually bind.
    for _ in 0..11 {
        let noise = new_sac(&env);
        StellarAssetClient::new(&env, &noise).mint(&lp, &(POOL_SIZE * 2));
        let pool_a = factory_client.create_pool(&creator, &usdc, &noise, &100u64, &4u32);
        let pool_b = factory_client.create_pool(&creator, &noise, &usdt, &100u64, &4u32);
        pool_wasm::Client::new(&env, &pool_a).add_liquidity(&lp, &POOL_SIZE, &POOL_SIZE, &1i128);
        pool_wasm::Client::new(&env, &pool_b).add_liquidity(&lp, &POOL_SIZE, &POOL_SIZE, &1i128);
    }

    let amount_in = 1_000 * PRECISION;
    let q = router.get_quote(&usdc, &usdt, &amount_in);
    assert_eq!(q.route.hops, 2u32);
    assert!(q.amount_out > 0);
    assert!(q.amount_out > amount_in * 9980 / 10000);

    let trader = Address::generate(&env);
    StellarAssetClient::new(&env, &usdc).mint(&trader, &amount_in);
    let deadline = env.ledger().sequence() + 100;
    let received = router.swap(&trader, &usdc, &usdt, &amount_in, &1i128, &deadline);
    assert!(received > 0);
}
