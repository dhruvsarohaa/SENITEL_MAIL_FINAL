import { Router } from "express";
import {
  generateApiKey,
  listApiKeys,
  createOrganization,
  getOrganization,
  addOrganizationUser,
  listOrganizationUsers,
} from "../services/tenant.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();

/** GET /api/tenants/current — Information about current tenant & authenticated user */
router.get("/current", async (req, res) => {
  res.json({
    tenant: req.tenant,
    user: req.user,
  });
});

/** POST /api/tenants/organizations — Provision a new enterprise organization */
router.post("/organizations", requireRole(["admin"]), async (req, res) => {
  try {
    const { name, slug, plan } = req.body;
    if (!name || !slug) {
      return res.status(400).json({ message: "Organization name and slug are required." });
    }
    const org = await createOrganization({ name, slug, plan });
    res.status(201).json(org);
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to create organization." });
  }
});

/** GET /api/tenants/api-keys — List API keys for current tenant (Admin only) */
router.get("/api-keys", requireRole(["admin"]), async (req, res) => {
  try {
    const keys = await listApiKeys(req.tenant.id);
    res.json(keys);
  } catch (err) {
    res.status(500).json({ message: "Failed to retrieve API keys." });
  }
});

/** POST /api/tenants/api-keys — Generate new API key (Admin only) */
router.post("/api-keys", requireRole(["admin"]), async (req, res) => {
  try {
    const { name, role } = req.body;
    if (!name) return res.status(400).json({ message: "API key name is required." });

    const VALID_ROLES = ["admin", "analyst", "auditor"];
    const targetRole = role || "analyst";
    if (!VALID_ROLES.includes(targetRole)) {
      return res.status(400).json({
        message: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`,
      });
    }

    const keyResult = await generateApiKey(req.tenant.id, name, targetRole);
    res.status(201).json({
      message: "Store this API key securely. It will not be shown again.",
      apiKey: keyResult.rawKey,
      name: keyResult.name,
      prefix: keyResult.prefix,
      role: keyResult.role,
      created_at: keyResult.created_at,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to create API key." });
  }
});

/** GET /api/tenants/users — List organization users (Admin and Auditor) */
router.get("/users", requireRole(["admin", "auditor"]), async (req, res) => {
  try {
    const users = await listOrganizationUsers(req.tenant.id);
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Failed to list users." });
  }
});

/** POST /api/tenants/users — Add team member to organization (Admin only) */
router.post("/users", requireRole(["admin"]), async (req, res) => {
  try {
    const { email, name, role } = req.body;
    if (!email || !name) {
      return res.status(400).json({ message: "Email and name are required." });
    }

    const VALID_ROLES = ["admin", "analyst", "auditor"];
    const targetRole = role || "analyst";
    if (!VALID_ROLES.includes(targetRole)) {
      return res.status(400).json({
        message: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`,
      });
    }

    const user = await addOrganizationUser({
      orgId: req.tenant.id,
      email,
      name,
      role: targetRole,
    });
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ message: "Failed to add user." });
  }
});

export default router;
