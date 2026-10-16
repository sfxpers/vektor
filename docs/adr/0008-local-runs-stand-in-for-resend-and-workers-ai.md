# Local runs stand in for Resend and Workers AI

`ENVIRONMENT=local` keeps a local run off Resend and Workers AI. Mail stays in the in-memory mailbox at `GET /api/dev/mail`. Tender analysis uses the deterministic stand-in. Production sets no `ENVIRONMENT`, so it uses both services. Calling them from a laptop was rejected: a test would send real mail and spend a real inference, and the smoke would need those secrets.
