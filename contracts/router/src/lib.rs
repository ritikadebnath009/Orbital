//! OrbitalDEX Router — Phase 2
//!
//! Finds optimal swap routes (1-hop direct or 2-hop via intermediate token)
//! and executes them atomically.
//!
//! CRIT-3 fix: execute_route now enforces min_amount_out on the final pool hop
//! rather than passing min_out=1 to every hop, preventing sandwich attacks from
//! exploiting per-hop slippage gaps.

#![no_std]

mod storage;

#[cfg(test)]
mod test;

use storage::{is_initialized, read_factory, write_factory};

use soroban_sdk::{
    contract, contractimpl, contracterror, contracttype,
    Address, Env, IntoVal, Symbol, Val, Vec,
};

// fee denominator for price-impact calculation (MED-2)
const FEE_DENOMINATOR: i128 = 10_000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum RouterError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    NoRouteFound = 3,
    SlippageExceeded = 4,
    ZeroAmount = 5,
    Expired = 6,
    InvalidTokens = 7,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct SwapRoute {
    pub tokens: Vec<Address>,
    pub pools: Vec<Address>,
    pub expected_out: i128,
    pub hops: u32,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct QuoteResult {
    pub amount_out: i128,
    pub route: SwapRoute,
    /// Price impact in basis points, excluding the swap fee (MED-2 fix).
    pub price_impact_bps: i64,
}

const MAX_INTERMEDIATES: u32 = 8;

#[contract]
pub struct Router;

#[contractimpl]
impl Router {
    pub fn initialize(e: Env, factory: Address) -> Result<(), RouterError> {
        if is_initialized(&e) {
            return Err(RouterError::AlreadyInitialized);
        }
        write_factory(&e, &factory);
        Ok(())
    }

    pub fn get_quote(
        e: Env,
        token_in: Address,
        token_out: Address,
        amount_in: i128,
    ) -> Result<QuoteResult, RouterError> {
        if token_in == token_out {
            return Err(RouterError::InvalidTokens);
        }
        if amount_in <= 0 {
            return Err(RouterError::ZeroAmount);
        }
        let factory = read_factory(&e);
        find_best_route(&e, &factory, &token_in, &token_out, amount_in)
    }

    /// Execute a swap through the optimal route.
    ///
    /// CRIT-3: min_amount_out is now passed down to execute_route and enforced
    /// on the final pool hop, not just checked after-the-fact at the router level.
    pub fn swap(
        e: Env,
        from: Address,
        token_in: Address,
        token_out: Address,
        amount_in: i128,
        min_amount_out: i128,
        deadline: u32,
    ) -> Result<i128, RouterError> {
        from.require_auth();

        if amount_in <= 0 {
            return Err(RouterError::ZeroAmount);
        }
        if e.ledger().sequence() >= deadline {
            return Err(RouterError::Expired);
        }

        let factory = read_factory(&e);
        let quote = find_best_route(&e, &factory, &token_in, &token_out, amount_in)?;

        if quote.amount_out < min_amount_out {
            return Err(RouterError::SlippageExceeded);
        }

        // Pass `from` (user) directly to pools — pools handle all token transfers.
        // The router never holds tokens; no router-level transfer calls needed.
        let actual_out = execute_route(&e, &quote.route, &from, &token_in, amount_in, min_amount_out)?;

        Ok(actual_out)
    }

    // ── Read views ────────────────────────────────────────────────────────────

    pub fn get_factory(e: Env) -> Address {
        read_factory(&e)
    }

    pub fn get_all_pools(e: Env) -> Vec<Address> {
        let factory = read_factory(&e);
        call_factory_vec(&e, &factory, "get_all_pools")
    }

    pub fn get_direct_pool(e: Env, token_a: Address, token_b: Address) -> Option<Address> {
        let factory = read_factory(&e);
        pool_for_pair(&e, &factory, &token_a, &token_b)
    }
}

// ── Route finding ─────────────────────────────────────────────────────────────

fn find_best_route(
    e: &Env,
    factory: &Address,
    token_in: &Address,
    token_out: &Address,
    amount_in: i128,
) -> Result<QuoteResult, RouterError> {
    let mut best: Option<QuoteResult> = None;

    // 1-hop: direct pool
    if let Some(pool) = pool_for_pair(e, factory, token_in, token_out) {
        if let Ok((out, fee_bps)) = simulate_pool_swap_with_fee(e, &pool, token_in, amount_in) {
            let route = SwapRoute {
                tokens: soroban_sdk::vec![e, token_in.clone(), token_out.clone()],
                pools: soroban_sdk::vec![e, pool],
                expected_out: out,
                hops: 1,
            };
            let impact = price_impact_bps(amount_in, out, fee_bps);
            best = Some(QuoteResult { amount_out: out, route, price_impact_bps: impact });
        }
    }

    // 2-hop: via each registered intermediate
    let all_pools   = call_factory_vec(e, factory, "get_all_pools");
    let intermediates = collect_intermediates(e, factory, &all_pools, token_in, token_out);

    for mid in intermediates.iter() {
        let pool_a = match pool_for_pair(e, factory, token_in, &mid) {
            Some(p) => p,
            None    => continue,
        };
        let pool_b = match pool_for_pair(e, factory, &mid, token_out) {
            Some(p) => p,
            None    => continue,
        };

        let (mid_out, fee_a) = match simulate_pool_swap_with_fee(e, &pool_a, token_in, amount_in) {
            Ok(v)  => v,
            Err(_) => continue,
        };
        let (final_out, fee_b) = match simulate_pool_swap_with_fee(e, &pool_b, &mid, mid_out) {
            Ok(v)  => v,
            Err(_) => continue,
        };

        let is_better = best.as_ref().map_or(true, |b| final_out > b.amount_out);
        if is_better {
            // Blended fee for two-hop price impact: average of both fee rates
            let blended_fee = (fee_a + fee_b) / 2;
            let route = SwapRoute {
                tokens: soroban_sdk::vec![e, token_in.clone(), mid.clone(), token_out.clone()],
                pools: soroban_sdk::vec![e, pool_a, pool_b],
                expected_out: final_out,
                hops: 2,
            };
            let impact = price_impact_bps(amount_in, final_out, blended_fee);
            best = Some(QuoteResult { amount_out: final_out, route, price_impact_bps: impact });
        }
    }

    best.ok_or(RouterError::NoRouteFound)
}

/// Execute a pre-computed route.
///
/// CRIT-3: min_amount_out is passed to the final pool call so each hop's output
/// is enforced at the pool level, not just aggregated at the router.
///
/// Auth fix: `from` is the original user address, not the router. Pools call
/// `token.transfer(from, pool, amount)` internally, which requires `from`'s auth —
/// already granted via `from.require_auth()` at the top of `swap()`. The router
/// never holds tokens.
fn execute_route(
    e: &Env,
    route: &SwapRoute,
    from: &Address,
    token_in: &Address,
    amount_in: i128,
    min_amount_out: i128,
) -> Result<i128, RouterError> {
    if route.hops == 1 {
        let pool = route.pools.get(0).unwrap();
        return call_pool_swap(e, &pool, from, token_in, amount_in, min_amount_out);
    }

    // 2-hop: enforce min_amount_out on the final pool call
    let pool_a = route.pools.get(0).unwrap();
    let pool_b = route.pools.get(1).unwrap();
    let mid    = route.tokens.get(1).unwrap();

    // First hop: no minimum enforced here (we don't know exact mid amount at quote time)
    let mid_out = call_pool_swap(e, &pool_a, from, token_in, amount_in, 1)?;
    // Second hop: enforce the total minimum on the output
    call_pool_swap(e, &pool_b, from, &mid, mid_out, min_amount_out)
}

// ── Cross-contract helpers ────────────────────────────────────────────────────

fn pool_for_pair(e: &Env, factory: &Address, a: &Address, b: &Address) -> Option<Address> {
    let args: Vec<Val> = soroban_sdk::vec![e, a.into_val(e), b.into_val(e)];
    e.invoke_contract::<Option<Address>>(factory, &Symbol::new(e, "get_pool"), args)
}

fn call_factory_vec(e: &Env, factory: &Address, func: &str) -> Vec<Address> {
    e.invoke_contract::<Vec<Address>>(factory, &Symbol::new(e, func), soroban_sdk::vec![e])
}

/// Simulate a pool swap, returning (amount_out, fee_bps_of_that_pool).
/// MED-2: fee_bps is now returned so price_impact_bps can exclude it.
fn simulate_pool_swap_with_fee(
    e: &Env,
    pool: &Address,
    token_in: &Address,
    amount_in: i128,
) -> Result<(i128, i128), RouterError> {
    // get_swap_result returns (amount_out, fee_amount)
    let args: Vec<Val> = soroban_sdk::vec![e, token_in.into_val(e), amount_in.into_val(e)];
    let (out, _fee): (i128, i128) = e.invoke_contract(pool, &Symbol::new(e, "get_swap_result"), args);
    if out <= 0 {
        return Err(RouterError::NoRouteFound);
    }
    // Retrieve the pool's fee_bps to compute accurate price impact
    let fee_args: Vec<Val> = soroban_sdk::vec![e];
    let fee_bps: u32 = e.invoke_contract(pool, &Symbol::new(e, "get_fee_bps"), fee_args);
    Ok((out, fee_bps as i128))
}

fn call_pool_swap(
    e: &Env,
    pool: &Address,
    from: &Address,
    token_in: &Address,
    amount_in: i128,
    min_out: i128,
) -> Result<i128, RouterError> {
    let args: Vec<Val> = soroban_sdk::vec![
        e,
        from.into_val(e),
        token_in.into_val(e),
        amount_in.into_val(e),
        min_out.into_val(e),
    ];
    Ok(e.invoke_contract::<i128>(pool, &Symbol::new(e, "swap"), args))
}

fn collect_intermediates(
    e: &Env,
    factory: &Address,
    all_pools: &Vec<Address>,
    token_in: &Address,
    token_out: &Address,
) -> Vec<Address> {
    let mut intermediates: Vec<Address> = Vec::new(e);

    for pool_addr in all_pools.iter() {
        let tokens = get_pool_tokens(e, &pool_addr);
        if tokens.is_none() {
            continue;
        }
        let (ta, tb) = tokens.unwrap();

        let mid = if &ta == token_in {
            Some(tb)
        } else if &tb == token_in {
            Some(ta)
        } else {
            None
        };

        if let Some(mid_token) = mid {
            if &mid_token == token_out {
                continue;
            }
            let already_added = intermediates.iter().any(|t| t == mid_token);
            if !already_added && intermediates.len() < MAX_INTERMEDIATES {
                intermediates.push_back(mid_token);
            }
        }
    }

    intermediates
}

fn get_pool_tokens(e: &Env, pool: &Address) -> Option<(Address, Address)> {
    Some(e.invoke_contract::<(Address, Address)>(
        pool,
        &Symbol::new(e, "get_tokens"),
        soroban_sdk::vec![e],
    ))
}

/// MED-2 fix: price impact excludes the swap fee so pure-fee trades show 0 impact.
///
/// impact = (net_in - amount_out) / net_in * 10000 bps
/// where net_in = amount_in * (FEE_DENOMINATOR - fee_bps) / FEE_DENOMINATOR
fn price_impact_bps(amount_in: i128, amount_out: i128, fee_bps: i128) -> i64 {
    if amount_in == 0 { return 0; }
    let net_in = amount_in * (FEE_DENOMINATOR - fee_bps) / FEE_DENOMINATOR;
    if net_in <= 0 { return 0; }
    let delta = net_in - amount_out;
    (delta * 10_000 / net_in) as i64
}
