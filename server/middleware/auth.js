import { validateApiKey, getOrganization, DEFAULT_ORG_ID } from "../services/tenant.js";
import pool from "../db/connection.js";
import { firebaseAuth } from "../services/firebase-admin.js";

/**
 * Resolve tenant context from X-Tenant-ID header or ?tenant= query param.
 * Admins can switch to any valid tenant; non-admins are restricted to their assigned org.
 */
async function resolveTenantContext(req, userRole, defaultTenant) {
  const requestedTenant = req.headers["x-tenant-id"] || req.query.tenant;
  if (!requestedTenant) {
    return { ok: true, tenant: defaultTenant };
  }

  // If user is admin, allow switching tenant; non-admins must be locked to their assigned org
  if (userRole !== "admin") {
    if (requestedTenant !== defaultTenant.id && requestedTenant !== defaultTenant.slug) {
      return {
        ok: false,
        status: 403,
        message: "Forbidden: Non-admin users cannot switch tenant context.",
      };
    }
    return { ok: true, tenant: defaultTenant };
  }

  const org = await getOrganization(requestedTenant);
  if (!org) {
    return {
      ok: false,
      status: 404,
      message: `Tenant '${requestedTenant}' not found.`,
    };
  }

  return {
    ok: true,
    tenant: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan || "enterprise",
    },
  };
}

/**
 * Authentication + tenant resolution middleware.
 *
 * Supports:
 * 1. Bearer API key: sm_live_...
 * 2. Bearer Firebase ID token
 * 3. Header-based Tenant Scope (X-Tenant-ID: <id_or_slug>)
 * 4. Query-based Tenant Scope (?tenant=<id_or_slug>)
 *
 * Protected API routes require authentication.
 * Unauthenticated requests are rejected in production, but fall back to the default
 * organization in local development for seamless zero-config forensic analysis.
 */
export async function tenantAuthMiddleware(req, res, next) {
  try {
    // Webhook ingestion endpoints handle their own provider-specific validation
    if (req.path === "/ingest/m365/webhook" || req.path === "/ingest/google/webhook") {
      return next();
    }

    const authHeader = req.headers["authorization"];
    let rawToken = null;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      rawToken = authHeader.slice(7).trim();
    } else if (req.headers["x-api-key"]) {
      rawToken = String(req.headers["x-api-key"]).trim();
    } else if (req.query.apiKey) {
      rawToken = String(req.query.apiKey).trim();
    }

    if (!rawToken) {
      if (process.env.NODE_ENV !== "production") {
        req.user = {
          id: "00000000-0000-0000-0000-000000000002",
          role: "admin",
          name: "Security Admin",
          email: "security-admin@sentinelmail.io",
        };
        const defaultTenant = {
          id: DEFAULT_ORG_ID,
          name: "Sentinel Corporation",
          slug: "sentinel-corp",
          plan: "enterprise",
        };
        const resolution = await resolveTenantContext(req, req.user.role, defaultTenant);
        if (!resolution.ok) {
          return res.status(resolution.status).json({ message: resolution.message });
        }
        req.tenant = resolution.tenant;
        return next();
      }

      return res.status(401).json({
        message: "Authentication required. Provide a valid Firebase ID token or API key.",
      });
    }

    // ---------------------------------------------------------
    // 1. Existing SentinelMail API key authentication
    // ---------------------------------------------------------
    if (rawToken.startsWith("sm_live_")) {
      const keyContext = await validateApiKey(rawToken);

      if (!keyContext) {
        return res.status(401).json({
          message: "Invalid or revoked API key.",
        });
      }

      req.user = {
        id: `apikey-${keyContext.keyId}`,
        role: keyContext.role,
        name: `API Key (${keyContext.role})`,
      };

      const defaultTenant = {
        id: keyContext.orgId,
        name: keyContext.orgName,
        slug: keyContext.orgSlug,
        plan: "enterprise",
      };

      const resolution = await resolveTenantContext(req, req.user.role, defaultTenant);
      if (!resolution.ok) {
        return res.status(resolution.status).json({ message: resolution.message });
      }
      req.tenant = resolution.tenant;

      return next();
    }

    // ---------------------------------------------------------
    // 2. Firebase Authentication
    // ---------------------------------------------------------
    let decodedToken;

    try {
      decodedToken = await firebaseAuth.verifyIdToken(rawToken);
    } catch (firebaseError) {
      // In development mode, if Firebase Admin has no service account credentials configured,
      // safely extract claims from the token payload so local dev and tests work smoothly
      if (process.env.NODE_ENV !== "production") {
        try {
          const parts = rawToken.split(".");
          if (parts.length === 3) {
            decodedToken = JSON.parse(Buffer.from(parts[1], "base64").toString("utf-8"));
          }
        } catch {
          // ignore
        }
      }

      if (!decodedToken) {
        console.warn(
          "Firebase token verification failed:",
          firebaseError.code || firebaseError.message,
        );

        return res.status(401).json({
          message: "Invalid or expired Firebase authentication token.",
        });
      }
    }

    const email =
      decodedToken.email?.trim().toLowerCase() || decodedToken.sub || "dev-analyst@sentinelmail.io";

    // ---------------------------------------------------------
    // 3. Resolve Firebase user against SentinelMail PostgreSQL
    // ---------------------------------------------------------
    let user;
    try {
      const result = await pool.query(
        `SELECT
           u.id,
           u.org_id,
           u.email,
           u.name,
           u.role,
           o.name AS org_name,
           o.slug AS org_slug,
           o.plan AS org_plan
         FROM users u
         JOIN organizations o ON o.id = u.org_id
         WHERE LOWER(u.email) = $1
         LIMIT 1`,
        [email],
      );
      user = result.rows?.[0];
    } catch {
      // ignore
    }

    if (!user) {
      // In development mode, auto-provision or assign default tenant so the analyst can work immediately!
      if (process.env.NODE_ENV !== "production") {
        req.user = {
          id: decodedToken.uid || decodedToken.user_id || "00000000-0000-0000-0000-000000000002",
          firebaseUid: decodedToken.uid || decodedToken.user_id,
          email: email,
          name: decodedToken.name || email.split("@")[0] || "Security Admin",
          role: "admin",
        };
        const defaultTenant = {
          id: DEFAULT_ORG_ID,
          name: "Sentinel Corporation",
          slug: "sentinel-corp",
          plan: "enterprise",
        };
        const resolution = await resolveTenantContext(req, req.user.role, defaultTenant);
        if (!resolution.ok) {
          return res.status(resolution.status).json({ message: resolution.message });
        }
        req.tenant = resolution.tenant;
        return next();
      }

      return res.status(403).json({
        message: "Firebase account is authenticated but is not provisioned in SentinelMail.",
      });
    }

    req.user = {
      id: user.id,
      firebaseUid: decodedToken.uid,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const defaultTenant = {
      id: user.org_id,
      name: user.org_name,
      slug: user.org_slug,
      plan: user.org_plan,
    };

    const resolution = await resolveTenantContext(req, req.user.role, defaultTenant);
    if (!resolution.ok) {
      return res.status(resolution.status).json({ message: resolution.message });
    }
    req.tenant = resolution.tenant;

    return next();
  } catch (err) {
    console.error("Tenant auth middleware error:", err);

    return res.status(500).json({
      message: "Authentication processing error.",
    });
  }
}

/**
 * Role-Based Access Control (RBAC) middleware generator.
 *
 * @param {string[]} allowedRoles
 */
export function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        message: "Unauthenticated.",
      });
    }

    // Admin has superuser access to all capabilities.
    if (req.user.role === "admin") {
      return next();
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Forbidden: Action requires one of [${allowedRoles.join(", ")}], current role is '${req.user.role}'.`,
      });
    }

    next();
  };
}

// import { validateApiKey, getOrganization, DEFAULT_ORG_ID } from "../services/tenant.js";

// /**
//  * Tenant resolution & Authentication middleware.
//  * Supports:
//  * 1. Bearer API Key (`Authorization: Bearer sm_live_...`)
//  * 2. Header-based Tenant Scope (`X-Tenant-ID: <org_id_or_slug>`)
//  * 3. Graceful fallback to default tenant for demo/browser sessions
//  */
// export async function tenantAuthMiddleware(req, res, next) {
//   try {
//     const authHeader = req.headers["authorization"];
//     const tenantHeader = req.headers["x-tenant-id"];

//     // 1. Check API Key authorization
//     if (authHeader && authHeader.startsWith("Bearer ")) {
//       const rawKey = authHeader.slice(7).trim();
//       const keyContext = await validateApiKey(rawKey);

//       if (keyContext) {
//         req.tenant = {
//           id: keyContext.orgId,
//           name: keyContext.orgName,
//           slug: keyContext.orgSlug,
//         };
//         req.user = {
//           id: `apikey-${keyContext.keyId}`,
//           role: keyContext.role,
//           name: `API Key (${keyContext.role})`,
//         };
//         return next();
//       }
//       return res.status(401).json({ message: "Invalid or revoked API key." });
//     }

//     // 2. Check X-Tenant-ID header (e.g. multi-tenant frontend or enterprise gateway)
//     if (tenantHeader) {
//       const org = await getOrganization(tenantHeader);
//       if (org) {
//         req.tenant = { id: org.id, name: org.name, slug: org.slug, plan: org.plan };
//         // Do not trust x-user-role header for admin privileges
//         req.user = { id: "header-user", role: "analyst" };
//         return next();
//       }
//       return res.status(404).json({ message: `Tenant '${tenantHeader}' not found.` });
//     }

//     // 3. Fallback to default organization for seamless local/browser operation
//     const defaultOrg = await getOrganization(DEFAULT_ORG_ID);
//     req.tenant = defaultOrg
//       ? { id: defaultOrg.id, name: defaultOrg.name, slug: defaultOrg.slug, plan: defaultOrg.plan }
//       : {
//           id: DEFAULT_ORG_ID,
//           name: "Sentinel Corporation",
//           slug: "sentinel-corp",
//           plan: "enterprise",
//         };

//     // Default to read-only analyst, NEVER admin
//     req.user = {
//       id: "default-local-user",
//       name: "Local Analyst",
//       role: "analyst",
//     };

//     next();
//   } catch (err) {
//     console.error("Tenant auth middleware error:", err);
//     res.status(500).json({ message: "Authentication processing error." });
//   }
// }

// /**
//  * Role-Based Access Control (RBAC) middleware generator.
//  * @param {string[]} allowedRoles Array of roles permitted, e.g. ['admin', 'finance_approver']
//  */
// export function requireRole(allowedRoles) {
//   return (req, res, next) => {
//     if (!req.user || !req.user.role) {
//       return res.status(401).json({ message: "Unauthenticated." });
//     }

//     // Admin has superuser access to all capabilities
//     if (req.user.role === "admin") {
//       return next();
//     }

//     if (!allowedRoles.includes(req.user.role)) {
//       return res.status(403).json({
//         message: `Forbidden: Action requires one of [${allowedRoles.join(", ")}], current role is '${req.user.role}'.`,
//       });
//     }

//     next();
//   };
// }
