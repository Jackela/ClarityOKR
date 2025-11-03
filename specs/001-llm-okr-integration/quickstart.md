# Quickstart: LLM Integration Feature

## Prerequisites
- Node.js 20.x
- Install dependencies: `npm install`
- Create `.env` at repo root with:
  - `LLM_API_KEY=...`
  - `LLM_BASE_URL=https://api.example.com` (optional; defaults to provider)
  - `LLM_MODEL=gpt-4o-mini` (example; change as needed)

Ensure `.env` is listed in `.gitignore`.

## Run Tests
- Unit/Integration: `npm test`
- Lint: `npm run lint`
- E2E (Electron): `npm run e2e` (Playwright)

Integration tests stub HTTP with `nock` (main process). Do not mock the agent service; simulate provider responses at the network layer.

## Development Notes
- Secrets are loaded only in Electron main; renderer communicates via IPC.
- Responses are non-streaming; show complete results when available.
- OKR draft starts with 1 Objective (3–5 KRs). Users can add more Objectives afterward.
