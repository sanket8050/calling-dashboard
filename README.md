# 📞 Calling Task Manager

A fast, simple, offline-first personal calling task manager. No database, no backend, no login.
Everything stays in your browser.

---

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## Build

```bash
npm run build
```

Output: `dist/`

---

## Deploy to Vercel

1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → New Project → Import repo
3. Framework: **Vite** (auto-detected)
4. Build Command: `npm run build`
5. Output Directory: `dist`
6. Click **Deploy**

The `vercel.json` handles client-side routing.

---

## How It Works

### Owner Workflow
1. Import contacts from CSV or JSON (Import/Export tab)
2. Review duplicates (auto-detected by phone number)
3. View Dashboard → stats, hot leads, callbacks
4. Export Master JSON → send to caller
5. Later: Import caller's Progress JSON → see updated statuses

### Caller Workflow
1. Open the website
2. Import the Master JSON (Home → Import JSON)
3. Click **Start Calling**
4. See one contact at a time — call, pick outcome, move to next
5. When done → Export Progress JSON → send to owner

---

## Key Features

- **Zero backend** — localStorage only
- **Smart deduplication** — phone-number normalized, Indian numbers handled (+91, 0 prefix)
- **Merge algorithm** — never overwrites newer calling progress with older data
- **CSV & JSON** import/export
- **Caller mode** — mobile-first, one-tap outcomes
- **Dashboard** — stats, hot leads, callbacks, sortable table
- **Offline** — works without internet after first load

## Data File Format

```json
{
  "appVersion": "1.0",
  "exportedAt": "2026-09-26T12:00:00.000Z",
  "contacts": [
    {
      "id": "phone-7722013548",
      "company": "Bright Precision Machining",
      "phone": "7722013548",
      "area": "Hadapsar",
      "role": "Quality / Operations",
      "status": "NEW",
      "callAttempts": 0,
      "history": []
    }
  ]
}
```

## Statuses

| Status | Meaning |
|--------|---------|
| NEW | Never called |
| ASKED_FOR_RESUME | They want a resume |
| INTERESTED | Showed real interest |
| CALLBACK | Call again later |
| NO_ANSWER | Nobody picked up |
| NOT_INTERESTED | Declined |
| WRONG_NUMBER | Bad number |
| NOT_RELEVANT | Not applicable |
