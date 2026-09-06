# SentinelMail

AI-assisted business-email compromise investigation and payment-fraud containment for finance teams.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Google sign-in setup

SentinelMail uses Google Identity Services directly—Firebase or Supabase are not required for the current sign-in screen.

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select a project.
2. Configure the OAuth consent screen and create an **OAuth client ID** for a **Web application**.
3. Add these authorized JavaScript origins:
   - `http://127.0.0.1:8080`
   - `http://localhost:8080`
   - your deployed production URL
4. Copy `.env.example` to `.env` and set `VITE_GOOGLE_CLIENT_ID` to the generated client ID.
5. Restart `npm run dev`, then open `/sign-in`.

For production, the FastAPI service must verify the Google credential token on every authenticated request (including its issuer and audience) and enforce the organization’s email-domain policy. The browser profile stored by this starter is only for the frontend session; it is not a substitute for server-side authorization.

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
