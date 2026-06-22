use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum PoolError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmp = 3,
    InvalidFee = 4,
    ZeroAmount = 5,
    InsufficientLiquidity = 6,
    SlippageExceeded = 7,
    InvalidToken = 8,
    SameToken = 9,
    InsufficientBalance = 10,
    Paused = 11,
    Unauthorized = 12,
    Overflow = 13,
    InvariantNotMaintained = 14,
    MinReserveViolation = 15,
    ConvergenceFailed = 16,
    InvalidShareAmount = 17,
    RampTooFast = 18,
    RampTimeInPast = 19,
    InvalidProtocolFee = 20,
    NoProtocolFeeRecipient = 21,
    // HIGH-2: clear error for single-sided first deposit
    FirstDepositRequiresBothTokens = 22,
    // HIGH-3: minimum size on first deposit
    FirstDepositBelowMinimum = 23,
    // MED-5 / HIGH-5: admin & upgrade governance
    NoPendingAdmin = 24,
    TimelockNotExpired = 25,
    NoPendingUpgrade = 26,
}
