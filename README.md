# Lone State Builders Co — Landing Page

Single-file hosting setup:

```
index.html
styles.css
config.js     ← Supabase URL + anon key live here
app.js        ← form logic + resumable uploads
supabase-setup.sql
```

## One-time Supabase setup

1. Open your Supabase project → **SQL Editor** → New query.
2. Paste the contents of `supabase-setup.sql` and run.
3. That creates:
   - `public.leads` table (with row-level-security; anon can insert, nothing else)
   - `blueprints` private storage bucket (750 MB cap per file)
   - Storage policies allowing anonymous uploads (resumable / TUS)

## Reviewing submissions

- **Leads** → Supabase Studio → Table Editor → `leads`.
- **Blueprints** → Supabase Studio → Storage → `blueprints`. Generate a **signed URL** to share any file with your team.

## File types & limits

Client-side we accept `.pdf`, `.dwg`, `.zip`, up to **750 MB per file**.
Uploads use `tus-js-client` so large files resume on a dropped connection.

## Changing copy

Content lives directly in `index.html`. Phone and address are in the contact section and footer.

## Email notifications (SendGrid)

Emails are sent by a Supabase Edge Function (`supabase/functions/send-lead-emails`) — **never from the browser** (that would expose your SendGrid key).

On every submission the function sends:
1. A welcome email to the person who uploaded
2. A notification to **daniel@purityhealth.co** and **F.turk@live.com** with the form data + signed download links for each blueprint (valid 14 days)

**One-time deploy:**

```bash
npm i -g supabase
supabase login
supabase link --project-ref rkjrspovoueajamzpfzc

supabase secrets set SENDGRID_API_KEY=ee29ae4dfa9a4e5cd82e144b15757342
supabase secrets set FROM_EMAIL=bids@lonestatebuilders.co
supabase secrets set FROM_NAME="Lone State Builders Co"
supabase secrets set TEAM_EMAILS="daniel@purityhealth.co,F.turk@live.com"

supabase functions deploy send-lead-emails --no-verify-jwt
```

**Important:** verify your `FROM_EMAIL` (or its domain) inside SendGrid → *Settings → Sender Authentication*. SendGrid rejects unverified senders.

## Security note

The `config.js` file contains only the **public anon key**, which is safe to ship.
The SendGrid key lives server-side in Supabase Edge Function secrets — never in client code.
