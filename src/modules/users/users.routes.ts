import { Hono }               from "hono";
import { authMiddleware }     from "@/middleware/auth.middleware";
import { requireRole, requireMinRole } from "@/middleware/rbac.middleware";
import * as handlers          from "./users.handlers";

const users = new Hono();

// All users routes require authentication at minimum
users.use("*", authMiddleware);

// ─── Own user ─────────────────────────────────────────────────────────────────
users.get("/me",   handlers.getMeHandler);
users.patch("/me", handlers.updateMeHandler);

// ─── Admin: any user by ID ────────────────────────────────────────────────────
users.get("/:id",        requireMinRole("admin"), handlers.getUserByIdHandler);
users.delete("/:id",     requireMinRole("admin"), handlers.deactivateUserHandler);

// ─── Admin: list all users ────────────────────────────────────────────────────
users.get("/",           requireMinRole("admin"), handlers.listUsersHandler);

// ─── Super Admin: role assignment ─────────────────────────────────────────────
users.patch("/:id/role", requireRole(["super_admin"]), handlers.assignRoleHandler);

export default users;