---
name: Rotate Supabase secret key before production
description: Reminder to rotate the Supabase service role secret key before deploying to production
type: project
---

Rotate the Supabase secret key before going to production.

**Why:** The secret key (service role) was shared in chat during development. It bypasses RLS and gives full DB access. Must be rotated before production deploy.

**How to apply:** Supabase → Settings → API Keys → Secret keys → three dots → Rotate key.
