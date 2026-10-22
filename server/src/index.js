import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
dotenv.config();

import authRoutes from "./routes/auth.js";
import doctorsRoutes from "./routes/doctors.js";
import medicinesRoutes from "./routes/medicines.js";
import appointmentsRoutes from "./routes/appointments.js";
import ordersRoutes from "./routes/orders.js";
import trialsRoutes from "./routes/trials.js";

// Defense-in-depth: every route is already wrapped in asyncHandler (see
// asyncHandler.js) so real request errors become clean 500 responses. These
// process-level listeners are a last-resort safety net for anything that
// somehow still slips through (e.g. an error thrown outside a request
// context) — log it and keep the server alive rather than crashing the
// whole process and taking down every in-flight request/test with it.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection (server kept alive):", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception (server kept alive):", err);
});

const app = express();

// Standard security response headers (X-Content-Type-Options, X-Frame-Options,
// CSP, HSTS, no X-Powered-By ...). Found missing by the ZAP baseline scan and
// locked in by SEC-10. CORP is relaxed to cross-origin because CORS is already
// configured explicitly below and the SPA is served from a different origin.
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173" }));
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/doctors", doctorsRoutes);
app.use("/api/medicines", medicinesRoutes);
app.use("/api/appointments", appointmentsRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/trials", trialsRoutes);

// Central error handler — keeps unhandled errors from leaking stack traces.
app.use((err, req, res, next) => {
  // Client errors raised by middleware (e.g. malformed JSON from express.json) are 4xx, not 500.
  if (err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: "Invalid request." });
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Meridian API listening on http://localhost:${port}`);
});
