# SentinelMail Production Cloud Deployment Guide

This guide provides step-by-step instructions to safely deploy **SentinelMail** to production cloud platforms (**Render**, **Railway**, **Fly.io**, or **AWS ECS**) with enterprise security, database durability, automated migrations, and zero-downtime health monitoring.

---

## 1. Safety & Production Hardening Checklist

Before deploying, verify these five mandatory security controls:

### 1.1 Strict `NODE_ENV=production`
- **Why it is critical**: In non-production mode, SentinelMail automatically grants `role: "admin"` to unauthenticated requests for local testing, and permits silent fallback to volatile in-memory storage (`MemoryStore`).
- **Enforcement**: In production (`NODE_ENV=production`), unauthenticated requests are rejected with **HTTP 401**, and server startup is aborted if the database is unreachable, preventing accidental customer data loss.

### 1.2 Managed PostgreSQL Database
- Ensure you provision a managed PostgreSQL database with automatic daily backups and SSL enabled (`?sslmode=require`).
- Migrations in `server/db/migrations/*.sql` execute automatically on server startup via `server/db/migrate.ts`.

### 1.3 Webhook Verification Secrets
Generate high-entropy random strings for webhook authentication:
- `M365_CLIENT_STATE`: Required so Microsoft Graph change notifications cannot be forged by external callers.
- `PUBSUB_VERIFICATION_TOKEN`: Required for Google Workspace Gmail push subscriptions.

### 1.4 API Keys & Secrets
- `GEMINI_API_KEY`: Required for live AI intent classification.
- `IPINFO_TOKEN`: Required for hop-by-hop relay IP geolocation and ASN intelligence.
- `FIREBASE_SERVICE_ACCOUNT_JSON` (Optional): Required if your team signs in with Firebase / Google Workspace SSO.

### 1.5 Strict CORS Origin Binding
- Set `CORS_ORIGIN` to the exact production frontend domain (e.g. `https://sentinelmail.yourdomain.com`). Never leave this wildcarded in production.

---

## 2. Option A: Deploying on Render (Recommended)

Render allows zero-config deployment using the included [`render.yaml`](file:///c:/Users/dsaro/Downloads/Sentinel-Mail-updated%20(2)/Sentinel-Mail-updated/Sentinel-Mail-main/render.yaml) Blueprint.

### Step 1: Connect Your Repository to Render
1. Navigate to your [Render Dashboard](https://dashboard.render.com).
2. Click **New +** &rarr; **Blueprint**.
3. Select your GitHub / GitLab repository containing SentinelMail.
4. Render automatically parses `render.yaml` and displays three resources to create:
   - **Database**: `sentinelmail-db` (PostgreSQL)
   - **Backend Web Service**: `sentinelmail-api`
   - **Frontend Web Service**: `sentinelmail-web`

### Step 2: Configure Environment Secrets
In the Render Blueprint wizard, supply the secret values that cannot be committed to Git:
- `GEMINI_API_KEY`: Your Google AI Studio API key.
- `IPINFO_TOKEN`: Your IPinfo.io token.
- `OPENAI_API_KEY` (Optional): OpenAI fallback API key.

### Step 3: Launch
Click **Apply**. Render will:
1. Provision the PostgreSQL instance and create database credentials.
2. Build and start `sentinelmail-api`, executing database migrations automatically.
3. Build `sentinelmail-web` with `VITE_API_BASE_URL` dynamically injected pointing to the live API service.

---

## 3. Option B: Deploying on Railway

Railway supports one-click deployment using Nixpacks or Dockerfile.

### Step 1: Provision PostgreSQL
1. Create a new project in [Railway](https://railway.app).
2. Click **+ New** &rarr; **Database** &rarr; **Add PostgreSQL**.
3. Railway automatically sets the `DATABASE_URL` variable.

### Step 2: Deploy Backend API Service
1. Click **+ New** &rarr; **GitHub Repo** &rarr; select SentinelMail.
2. In **Settings**:
   - **Build Command**: `npm install`
   - **Start Command**: `node --import tsx server/index.ts`
3. In **Variables**:
   - `NODE_ENV`: `production`
   - `PORT`: `${{PORT}}`
   - `DATABASE_URL`: `${{Postgres.DATABASE_URL}}`
   - `GEMINI_API_KEY`: `<your_gemini_key>`
   - `IPINFO_TOKEN`: `<your_ipinfo_token>`
   - `M365_CLIENT_STATE`: `<random_secret_32_chars>`
   - `PUBSUB_VERIFICATION_TOKEN`: `<random_secret_32_chars>`
   - `CORS_ORIGIN`: `https://${{RAILWAY_PUBLIC_DOMAIN}}`
4. In **Networking**, click **Generate Domain** (e.g. `sentinel-api-production.up.railway.app`).

### Step 3: Deploy Frontend Web Service
1. In the same project, click **+ New** &rarr; **GitHub Repo** &rarr; select SentinelMail again.
2. In **Settings**:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `node .output/server/index.mjs`
3. In **Variables**:
   - `NODE_ENV`: `production`
   - `PORT`: `${{PORT}}`
   - `VITE_API_BASE_URL`: `https://sentinel-api-production.up.railway.app`
   - `VITE_DEMO_MODE`: `false`
4. Generate a public domain for the frontend.

---

## 4. Option C: Deploying on Fly.io

Fly.io runs SentinelMail as lightweight microVMs globally.

### Step 1: Install Flyctl & Authenticate
```bash
flyctl auth login
```

### Step 2: Provision Fly Postgres
```bash
flyctl postgres create --name sentinelmail-db --region iad --initial-cluster-size 1 --vm-size shared-cpu-1x --volume-size 10
```

### Step 3: Launch Application
```bash
flyctl launch --no-deploy
```
Attach PostgreSQL database to the application:
```bash
flyctl postgres attach sentinelmail-db
```

### Step 4: Set Production Secrets
```bash
flyctl secrets set \
  NODE_ENV=production \
  GEMINI_API_KEY="AIzaSy..." \
  IPINFO_TOKEN="your_token" \
  M365_CLIENT_STATE="$(openssl rand -hex 16)" \
  PUBSUB_VERIFICATION_TOKEN="$(openssl rand -hex 16)"
```

### Step 5: Deploy
```bash
flyctl deploy
```

---

## 5. Option D: Deploying on AWS (ECS Fargate / App Runner)

1. **Database**: Provision Amazon RDS for PostgreSQL (db.t4g.micro or higher) in a private subnet.
2. **Container Registry**: Push the Docker image to Amazon ECR:
   ```bash
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <aws_account_id>.dkr.ecr.us-east-1.amazonaws.com
   docker build -t sentinelmail:latest .
   docker tag sentinelmail:latest <aws_account_id>.dkr.ecr.us-east-1.amazonaws.com/sentinelmail:latest
   docker push <aws_account_id>.dkr.ecr.us-east-1.amazonaws.com/sentinelmail:latest
   ```
3. **Task Definition (ECS Fargate)**:
   - Configure Task Role and Execution Role.
   - Inject secrets via AWS Secrets Manager or Parameter Store (`DATABASE_URL`, `GEMINI_API_KEY`, `IPINFO_TOKEN`).
   - Configure Container Health Check:
     `CMD-SHELL, curl -f http://localhost:3001/api/health || exit 1`
4. **Application Load Balancer (ALB)**:
   - Route `/api/*` to Target Group (Port 3001).
   - Route `/*` to Target Group (Port 3000).
   - Attach ACM TLS/SSL certificate.

---

## 6. Post-Deployment Smoke Test & Verification

Once your deployment is live, run these three smoke tests from your local machine to confirm system integrity:

### 1. Health & Database Cascade Verification
```bash
curl -i https://<your-api-domain>/api/health
```
**Expected Response**:
```json
HTTP/2 200
{
  "status": "ok",
  "database": "postgresql",
  "timestamp": "2026-09-08T..."
}
```
*(Verify `"database"` reports `"postgresql"`, NOT `"memory"`!)*

### 2. Authentication Enforcement Test
```bash
curl -i https://<your-api-domain>/api/cases
```
**Expected Response in Production**:
```json
HTTP/2 401 Unauthorized
{
  "message": "Authentication required. Provide a valid Firebase ID token or API key."
}
```

### 3. Generate Initial Organization API Key
If you need an administrative API key for external mail pollers:
1. Connect via SSH/Console to the running container or VPS:
```bash
node -e "
import('./server/services/tenant.js').then(async ({ generateApiKey, DEFAULT_ORG_ID }) => {
  const res = await generateApiKey(DEFAULT_ORG_ID, 'Production Root Admin', 'admin');
  console.log('\n--- ROOT PRODUCTION API KEY ---');
  console.log('API Key:', res.rawKey);
  console.log('-------------------------------\n');
  process.exit(0);
});"
```
2. Test authenticated access:
```bash
curl -i -H "x-api-key: sm_live_..." https://<your-api-domain>/api/cases
```
**Expected Response**:
```json
HTTP/2 200 OK
[]
```

Your production deployment is now secure, durable, and ready for live forensic analysis.
