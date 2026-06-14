// Middleware – JWT verification & role extraction
import { createMiddleware } from "hono/factory";
import { jwtVerify, importSPKI } from "jose";
import { env }               from "@/env";
import { UnauthorizedError } from "@/lib/errors";
import type { Role }         from "@/db/schema";

export type AuthVariables = {
  userId:   string;
  userRole: Role;
};

export const authMiddleware = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing or malformed Authorization header");
    }

    const token     = authHeader.slice(7);
    const publicKey = await importSPKI(
      env.JWT_PUBLIC_KEY.replace(/\\n/g, "\n"),
      "RS256",
    );

    try {
      const { payload } = await jwtVerify(token, publicKey, { algorithms: ["RS256"] });

      if (typeof payload.sub !== "string" || typeof payload.role !== "string") {
        throw new UnauthorizedError("Invalid token payload");
      }

      c.set("userId",   payload.sub);
      c.set("userRole", payload.role as Role);
    } catch {
      throw new UnauthorizedError("Invalid or expired token");
    }

    await next();
  },
);