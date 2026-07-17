# Nature Fit Restaurant — Website

A modern, responsive website for **Nature Fit Restaurant** (Al Safa Complex, Dubai), promoting healthy eating and online ordering, with a secure Node.js/Express backend contact form.

```
nature-fit/
├── frontend/           Static site (HTML/CSS/JS) → deploy to Vercel
│   ├── index.html
│   ├── css/style.css
│   ├── js/script.js
│   └── vercel.json
└── backend/            Express API (Contact form) → deploy to Render
    ├── server.js
    ├── config/          db.js (MySQL/Clever Cloud), mailer.js (Nodemailer)
    ├── controllers/      contactController.js
    ├── routes/           contactRoutes.js
    ├── middleware/       validateContact.js, errorHandler.js
    ├── models/           contactModel.js
    ├── .env.example
    └── render.yaml
```

## Frontend

Plain HTML/CSS/JS, no build step. Sections: Hero ("Eat Healthy, Live Better"), About Us, Why Choose Us, Healthy Food Menu (filterable), Order Online (Talabat, Careem Food, Noon Food, Keeta), Gallery, Customer Reviews, FAQs, Contact form.

**Run locally:** open `frontend/index.html` with a local server (e.g. VS Code "Live Server", or `npx serve frontend`).

**Configure the API URL:** in `frontend/js/script.js`, update:
```js
const API_BASE_URL = window.NATURE_FIT_API_URL || "https://your-backend-service.onrender.com";
```
to your deployed Render backend URL.

**Deploy to Vercel:**
1. Push the `frontend` folder to a GitHub repo (or import directly).
2. In Vercel, "Add New Project" → select the repo → set root directory to `frontend`.
3. Framework preset: "Other" (static site) — no build command needed.
4. Deploy. Note the generated URL and add it to the backend's `CLIENT_ORIGIN` env var.

## Backend

Node.js + Express API responsible for the Contact form: validation → MySQL (Clever Cloud) storage → admin email notification (Nodemailer).

**Setup locally:**
```bash
cd backend
cp .env.example .env   # fill in your real credentials
npm install
npm run dev             # nodemon, or `npm start` for plain node
```

**Environment variables** — see `.env.example` for the full list:
- `CLIENT_ORIGIN` — comma-separated list of allowed frontend origins (CORS)
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` — Clever Cloud MySQL credentials
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `ADMIN_EMAIL`, `MAIL_FROM` — Nodemailer/SMTP settings

**API:**
| Method | Endpoint       | Description                          |
|--------|----------------|---------------------------------------|
| GET    | `/api/health`  | Health check                          |
| POST   | `/api/contact` | Submit contact form (rate-limited, validated) |

**Deploy to Render:**
1. Push the `backend` folder to a GitHub repo.
2. In Render, "New +" → "Web Service" → connect the repo, root directory `backend`.
3. Build command: `npm install`, start command: `npm start`.
4. Add all environment variables from `.env.example` in the Render dashboard.
5. Deploy, then set the generated Render URL as `API_BASE_URL` in the frontend and redeploy the frontend.

### Database (Clever Cloud MySQL)
1. Create a MySQL add-on on Clever Cloud and copy its host/port/user/password/database name into the backend env vars.
2. On first boot, the server automatically creates the `contact_messages` table if it doesn't exist (see `config/db.js`).

### Email (Nodemailer)
Use any SMTP provider (Gmail with an App Password, SendGrid, Mailgun, Amazon SES, etc.). Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and `ADMIN_EMAIL` accordingly. The server logs whether SMTP verification succeeded on startup.

## Security & reliability notes
- `helmet` for secure HTTP headers, strict CORS allow-list, `express-rate-limit` on the contact endpoint (default: 5 requests / 15 min per IP).
- Server-side validation & sanitization via `express-validator` (mirrors the client-side validation in `script.js`).
- Centralized error handling (`middleware/errorHandler.js`) with clean JSON responses and no stack traces leaked in production.
- Email notification failures never fail the customer-facing request — the message is safely stored in MySQL regardless.
