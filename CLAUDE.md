# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

```bash
npm install
node main.js        # starts on http://localhost:8000
```

No build step, no test suite, no package.json scripts.

## Environment Setup

Copy `.env.example` to `.env` and configure:
- `PORT` — default 8000
- `API_BASE_URL` — external fuel price API (`https://giaxanghomnay.com/api/pvdate/`)
- `SQLITE_DB_PATH` — path to SQLite file (`./database/fuel_data.db`)
- `MSSQL_*` — SQL Server credentials (optional; app degrades gracefully if unavailable)

## Architecture

Layered Express backend (`src/`) + static HTML frontend (`view/`). Entry point: `main.js` → `src/server.js`.

```
src/
├── server.js          # startup: dotenv, DB init, app.listen
├── app.js             # Express factory: middleware, route mounting
├── config/db.js       # SQLite + MSSQL singleton connections
├── routes/            # HTTP route declarations (auth, fuel, rate)
├── controllers/       # Request/response handlers
├── services/          # Business logic (fuel.service, rate.service)
├── models/            # Raw DB queries (user, fuelPrice, rate)
└── middleware/        # auth.js (token store), errorHandler.js
```

**Request flow for surcharge lookup:**
1. `GET /api/get_fuel_price?date=YYYY-MM-DD` → `fuel.routes.js` → `fuel.controller.getFuelPrice`
2. Controller calls `fuel.service.fetchAndCalculateFuelPrice(date)`
3. Service fetches from external API (`giaxanghomnay.com`) and calls `tinhGiaCuocTheoDauDO()` for 6 container types
4. Controller saves result via `fuelPrice.model.insertFuelPrice()` then responds

**Key files:**
- [src/handle/calculator_gasoline.js](src/handle/calculator_gasoline.js) — hardcoded surcharge rate table (`bangPhuThu`) with 10 price brackets; maps to 6 container types (`hang_20/40/45`, `rong_20/40/45`)
- [src/middleware/auth.js](src/middleware/auth.js) — in-memory token store (Map), 24h expiry, role checks (`user` vs `admin`)
- [src/models/user.model.js](src/models/user.model.js) — promisified SQLite queries for `users` table
- [src/models/rate.model.js](src/models/rate.model.js) — SQL Server queries for `TRF_STD` table (NH/HH/NR/HR)
- [view/index.html](view/index.html) — main dashboard (Vietnamese UI)
- [view/login.html](view/login.html) — login page

## Databases

**SQLite** (`database/fuel_data.db`) — always required; tables must pre-exist (no migration scripts):
- `fuel_prices` — fetched prices + calculated surcharges per date/brand
- `users` — auth users with roles (`user`/`admin`)

**SQL Server** (`PRD_MPC` database, `TRF_STD` table) — optional; used only for reading/writing surcharge rate overrides via admin endpoints. Connection failure is non-fatal.

## Auth

Token-based, in-memory. Tokens are lost on server restart. Admin role is required for `POST /api/update_trf_std`, `GET /api/users`, and `DELETE /api/users/:id`.

## Maintaining PROJECT_STRUCTURE.md

**REQUIRED**: Whenever you add, remove, or rename any file or directory in this project, you MUST update [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) to reflect the change. This includes:
- Adding or deleting source files (`src/**`, `public/**`, `views/**`, etc.)
- Creating new routes, controllers, services, or models
- Restructuring folders
- Adding new top-level files

Update the directory tree and any affected sections (API Endpoints, Request Flow, etc.) in the same task — do not defer it.

## Notable Constraints

- Surcharge brackets are hardcoded in `src/handle/calculator_gasoline.js` — not database-driven. Change them there.
- All UI text and API error messages are in Vietnamese.
- SQL Server connection is attempted at startup; failure logs a warning but doesn't prevent startup.
- The `database/` directory (and its `.db` file) is committed to the repo.
