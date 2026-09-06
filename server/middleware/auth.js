import { validateApiKey } from "../services/tenant.js";
import pool from "../db/connection.js";
import { firebaseAuth } from "../services/firebase-admin.js";

/**
 * Authentication + tenant resolution middleware.
 *
 * Supports:
 * 1. Bearer API key: sm_live_...
 * 2. Bearer Firebase ID token
 *
 * Protected API routes require one of the above.
 * Unauthenticated requests are rejected.
 */
export async function tenantAuthMiddleware(req, res, next) {
  try {
    const authHeader = req.headers["authorization"];

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Authentication required. Provide a valid Firebase ID token or API key.",
      });
    }

    const rawToken = authHeader.slice(7).trim();

    if (!rawToken) {
      return res.status(401).json({
        message: "Authentication token is missing.",
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

      req.tenant = {
        id: keyContext.orgId,
        name: keyContext.orgName,
        slug: keyContext.orgSlug,
      };

      req.user = {
        id: `apikey-${keyContext.keyId}`,
        role: keyContext.role,
        name: `API Key (${keyContext.role})`,
      };

      return next();
    }

    // ---------------------------------------------------------
    // 2. Firebase Authentication
    // ---------------------------------------------------------
    let decodedToken;

    try {
      decodedToken = await firebaseAuth.verifyIdToken(rawToken);
    } catch (firebaseError) {
      console.warn("Firebase token verification failed:", firebaseError.code || firebaseError.message);

      return res.status(401).json({
        message: "Invalid or expired Firebase authentication token.",
      });
    }

    const email = decodedToken.email?.trim().toLowerCase();

    if (!email) {
      return res.status(403).json({
        message: "Authenticated Firebase account does not have an email address.",
      });
    }

    // ---------------------------------------------------------
    // 3. Resolve Firebase user against SentinelMail PostgreSQL
    // ---------------------------------------------------------
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

    if (!result.rows[0]) {
      return res.status(403).json({
        message: "Firebase account is authenticated but is not provisioned in SentinelMail.",
      });
    }

    const user = result.rows[0];

    req.user = {
      id: user.id,
      firebaseUid: decodedToken.uid,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    req.tenant = {
      id: user.org_id,
      name: user.org_name,
      slug: user.org_slug,
      plan: user.org_plan,
    };

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
