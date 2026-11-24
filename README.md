# ARENA360 — Sports & Facility Management Platform

Full-stack Sports Management System built with **React 19**, **TypeScript**, **Tailwind CSS v4**, **Express**, **Node SQLite / PostgreSQL Schema**, and **Firebase Authentication & Firestore Rules**.

---

## 1. Architecture Overview

- **Frontend (`/src`)**:
  - Public Discovery: Landing with Sign In, Sports Directory (12 Bengaluru disciplines), Bengaluru Facility Discovery, Facility Availability Calendar, Certified Trainers (6 approved Bengaluru coaches), Customer Registration, and Forgot Password.
  - Four Role-Based Dashboards (`Customer`, `Trainer`, `Facility Owner`, `Administrator`) guarded on both client routes and Express backend RBAC middleware.
- **Backend (`/server.ts`, `/src/server/*`)**:
  - `domain.ts`: Pure business logic (booking state machine, 10-minute reservation hold expiry, tiered cancellation refund calculation, HMAC-SHA256 payment verification, input validators).
  - `db.ts`: Normalized 20-table relational database with foreign keys, partial unique index (`idx_bookings_no_double_book`) preventing concurrent double-booking, and automatic initial seeding.
  - `auth.ts`: `bcryptjs` password hashing, signed JWT sessions, Firebase ID token verification, and `requireAuth` / `requireRole` RBAC middleware.
  - `routes.ts`: Complete REST API covering FR1–FR15.
- **Database Deployment Readiness (`/db/schema.sql`, `firebase-blueprint.json`, `firestore.rules`)**:
  - Full PostgreSQL 3NF schema in `db/schema.sql` for Vercel + Supabase / Cloud SQL deployments.
  - Hardened Firestore security rules in `firestore.rules`.

---

## 2. Environment Setup & Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and configure secrets (`JWT_SECRET`, optional `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`, `SMTP_HOST`).
3. Start development server on port `3000`:
   ```bash
   npm run dev
   ```
4. Build & start production bundle:
   ```bash
   npm run build
   npm start
   ```

---

## 3. Initial Seeded Accounts & Creating First Admin

On first boot, `src/server/db.ts` seeds initial data for all 4 roles (default password `user@123`, configurable via `SEED_DEMO_PASSWORD` env var):

| Role | Email | Capabilities |
| :--- | :--- | :--- |
| Customer | `customer@gmail.com` | Book facilities/trainers, pay via UPI/card, cancel/reschedule, review |
| Trainer | `trainer@gmail.com` | Profile, certifications, availability slots, session management |
| Facility Owner | `owner@gmail.com` | Edit assigned facilities, operating hours, block/unblock slots, manage bookings |
| Administrator | `admin@gmail.com` | Provision trainer/owner accounts, approve trainers, manage sports, moderate reviews, resolve issues |

For production deployments, register via `POST /api/auth/register` and promote the initial administrator directly in the `users` table (`role = 'admin'`).

---

## 4. Backup & Recovery (NFR10)

- **SQLite Mode**: Schedule automated daily `.backup` snapshots of `data/arena360.db` using `sqlite3 data/arena360.db ".backup 'backups/arena360-$(date +%F).db'"` with WAL checkpointing.
- **PostgreSQL / Supabase Mode**: Enable automated daily Point-in-Time Recovery (PITR) and `pg_dump --format=custom` off-site encrypted backups.

---

## 5. Testing

Run domain unit tests:
```bash
npm test
```
TypeScript static verification:
```bash
npm run lint
```
