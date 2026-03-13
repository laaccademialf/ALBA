# ALBA

Modern React + Vite app for personal and family finance tracking.

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start dev server:

```bash
npm run dev -- --host 0.0.0.0 --port 5173
```

3. Open in browser:

```text
http://localhost:5173
```

## Firestore setup

1. Copy `.env.example` to `.env`.
2. Fill in your Firebase Web App credentials.
3. Restart dev server.

If env values are missing, ALBA runs in local demo mode automatically.

## Create Firebase user from terminal

After filling `.env`, run:

```bash
npm run create:user -- your@email.com "StrongPassword123!"
```

Required env keys for this command:

- VITE_FIREBASE_API_KEY
- VITE_FIREBASE_APP_ID

## Implemented features

- Elegant Login/Register first screen
- Glassmorphism dashboard with mobile-first touch targets
- Draggable income accounts to expense categories
- Numeric keypad modal with confirm flow
- Firestore sync for accounts, categories, and transactions
- Fixed bottom navigation: Dashboard, Analytics, Family, Settings