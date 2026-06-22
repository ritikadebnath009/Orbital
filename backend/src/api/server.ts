import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { poolsRouter } from "./routes/pools";
import { historyRouter } from "./routes/history";
import { faucetRouter } from "./routes/faucet";

const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

function buildCorsOrigins(): string[] {
  const configured = process.env.FRONTEND_URL || "http://localhost:3000";
  // Accept any localhost port in development so the Next.js dev server port doesn't block calls
  if (process.env.NODE_ENV !== "production") {
    return [configured, "http://localhost:3000", "http://localhost:3001", "http://localhost:3002"];
  }
  return [configured];
}

export function createApp() {
  const app = express();

  app.use(cors({
    origin: buildCorsOrigins(),
    credentials: true,
  }));
  app.use(express.json());
  app.use("/api/", apiLimiter);

  // Health check
  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  // API routes
  app.use("/api/pools", poolsRouter);
  app.use("/api/history", historyRouter);
  app.use("/api/faucet", faucetRouter);

  // 404 fallback
  app.use((_req, res) => res.status(404).json({ error: "Not found" }));

  return app;
}
