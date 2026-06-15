import { Hono }              from "hono";
import { authMiddleware }    from "@/middleware/auth.middleware";
import * as handlers         from "./auth.handlers";

const auth = new Hono();

// ─── Public ───────────────────────────────────────────────────────────────────
auth.post("/register", handlers.registerHandler);
auth.post("/login",    handlers.loginHandler);
auth.post("/refresh",  handlers.refreshHandler);

// ─── Authenticated ────────────────────────────────────────────────────────────
auth.post("/logout",       authMiddleware, handlers.logoutHandler);
auth.post("/verify-email", authMiddleware, (_c) => {
  // TODO: implement email verification flow
  throw new Error("Not implemented");
});

export default auth;