/* =============================================================================
   Supabase config for Lone State Builders Co
   -----------------------------------------------------------------------------
   NOTE: Only the public anon key belongs in client code. NEVER put the secret
   key here — it's server-side only.
============================================================================= */

window.LSB_CONFIG = {
  SUPABASE_URL: "https://rkjrspovoueajamzpfzc.supabase.co",
  SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJranJzcG92b3VlYWphbXpwZnpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NjQ2NDUsImV4cCI6MjA4ODM0MDY0NX0.7X-OL0K3TjCH5izqOJ4YCBrGbmJUNgK82PSjUatRYhM",

  // Storage bucket name — see supabase-setup.sql
  BUCKET: "blueprints",

  // Database table that receives each submitted lead
  LEADS_TABLE: "leads",

  // Limits
  MAX_FILE_BYTES: 750 * 1024 * 1024, // 750 MB per file
  ACCEPTED: /\.(pdf|dwg|zip)$/i,
};
