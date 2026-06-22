import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";

export const faucetRouter = Router();

const RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_HOUR = 2;

// Per-address rate limit (IP limiter below handles abuse at network level)
const addressStore = new Map<string, { count: number; resetAt: number }>();

function addressRateLimitMiddleware(req: Request, res: Response, next: () => void) {
  const { address } = req.body as { address?: string };
  if (!address) return next();
  const now = Date.now();
  const entry = addressStore.get(address);
  if (entry && now < entry.resetAt) {
    if (entry.count >= MAX_PER_HOUR) {
      res.status(429).json({ error: "Faucet limit reached — 2 requests per address per hour." });
      return;
    }
    entry.count++;
  } else {
    addressStore.set(address, { count: 1, resetAt: now + RATE_WINDOW_MS });
  }
  next();
}

const ipLimiter = rateLimit({
  windowMs: RATE_WINDOW_MS,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many faucet requests." },
});

// POST /api/faucet  { address: "G..." }
// Proxies Stellar testnet friendbot — gives 10,000 XLM.
// USDC is Circle's token; we can't distribute it. Users get it from Circle's testnet.
faucetRouter.post("/", ipLimiter, addressRateLimitMiddleware, async (req: Request, res: Response) => {
  const { address } = req.body as { address?: string };

  if (!address || !/^G[A-Z2-7]{55}$/.test(address)) {
    return res.status(400).json({ error: "Invalid Stellar address" });
  }

  try {
    const fbRes = await fetch(`https://friendbot.stellar.org?addr=${address}`);
    if (fbRes.ok) {
      return res.json({
        success: true,
        message: "10,000 XLM sent to your wallet via Stellar friendbot.",
        token: "XLM",
      });
    }

    // Friendbot returns 400 if account already funded — still OK
    const body = await fbRes.json().catch(() => ({})) as Record<string, unknown>;
    const detail = JSON.stringify(body);
    if (detail.includes("op_already_exists") || detail.includes("createAccountAlreadyExist")) {
      return res.status(400).json({
        error: "Account already funded by friendbot. Your wallet already has XLM.",
      });
    }

    return res.status(500).json({ error: "Friendbot unavailable. Try https://friendbot.stellar.org directly." });
  } catch {
    return res.status(500).json({ error: "Friendbot request failed. Try https://friendbot.stellar.org directly." });
  }
});
