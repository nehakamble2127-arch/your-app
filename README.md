# your-app — SMS / Group Chat Backend (Single-server + MongoDB)

**Status:** ✅ Working (group creation, group messaging, fetch messages).  
This repo is ready to run as a single server that connects to a single MongoDB database.

---

## Quick summary (what's included)
- Node.js + Express backend (Mongoose)
- MongoDB database (Atlas recommended) — single DB used: `sms_app`
- Routes:
  - `POST /api/auth/signup` (if implemented)
  - `POST /api/auth/login` (if implemented)
  - `POST /api/groups` -> create group
  - `POST /api/groups/:id/message` -> send group message
  - `GET  /api/groups/:id/messages` -> fetch group messages
- Serves frontend static files from `public/` (or `frontend/build/` if you build a frontend)

---

## Environment (.env)
Create a `.env` file inside `your-app/` (do NOT commit it). Example:

