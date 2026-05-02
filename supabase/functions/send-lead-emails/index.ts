// ============================================================================
//  Supabase Edge Function — send-lead-emails
//  Triggered by the landing page after a new row is inserted into `leads`.
//  Sends (1) welcome email to the uploader, (2) notification email to the team
//  with a summary and signed download URLs for every uploaded blueprint.
//
//  DEPLOYMENT
//  ----------
//  1. Install the Supabase CLI: https://supabase.com/docs/guides/cli
//  2. From project root:
//       supabase login
//       supabase link --project-ref rkjrspovoueajamzpfzc
//       supabase secrets set RESEND_API_KEY=<your-resend-api-key>
//       supabase secrets set FROM_EMAIL=bids@lonestateservices.com
//       supabase secrets set FROM_NAME="Lone State Builders Co"
//       supabase secrets set TEAM_EMAILS="daniel@purityhealth.co,F.turk@live.com"
//       supabase functions deploy send-lead-emails --no-verify-jwt
//
//  NOTE ON FROM_EMAIL: Resend will REJECT the send unless the sending domain
//  (lonestateservices.com) is verified in Resend → Domains.
// ============================================================================

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "bids@lonestateservices.com";
const FROM_NAME  = Deno.env.get("FROM_NAME")  ?? "Lone State Builders Co";
const TEAM_EMAILS = (Deno.env.get("TEAM_EMAILS") ?? "daniel@purityhealth.co,F.turk@live.com")
  .split(",").map(s => s.trim()).filter(Boolean);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function esc(s: any): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function fmtBytes(n: number): string {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

async function signedUrls(paths: string[]): Promise<{path: string; url: string}[]> {
  if (!paths?.length) return [];
  const { data, error } = await admin.storage
    .from("blueprints")
    .createSignedUrls(paths, 60 * 60 * 24 * 14); // 14 days
  if (error) { console.error("signedUrls error", error); return []; }
  return (data ?? []).map((d: any, i: number) => ({
    path: paths[i],
    url: d?.signedUrl ?? "",
  }));
}

async function resendSend(payload: Record<string, unknown>): Promise<void> {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`Resend ${r.status}: ${body}`);
  }
}

function welcomeHtml(lead: any): string {
  return `
<!doctype html>
<html><body style="margin:0;padding:0;background:#F6F2EA;font-family:-apple-system,Segoe UI,Inter,sans-serif;color:#141210">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F6F2EA;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #D6CFC0">
        <tr><td style="padding:28px 32px;border-bottom:1px solid #D6CFC0">
          <div style="font-family:Georgia,serif;font-size:22px;letter-spacing:-0.01em">Lone State Builders Co.</div>
          <div style="font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.14em;color:#8A8478;text-transform:uppercase;margin-top:4px">Commercial & Residential Doors · Hardware · General Building</div>
        </td></tr>
        <tr><td style="padding:32px">
          <h1 style="margin:0 0 12px;font-family:Georgia,serif;font-weight:500;font-size:28px;line-height:1.1;letter-spacing:-0.02em">Thanks, ${esc(lead.name)}.</h1>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#2A2620">We've received your request${lead.file_count ? ` along with <strong>${lead.file_count} file${lead.file_count > 1 ? "s" : ""}</strong>` : ""}. An estimator on our team will review your plans and get back to you within one business day.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.55;color:#2A2620">Standard turnaround for a full bid is <strong>five business days</strong>. If the job needs to move faster, reply to this email and we'll prioritize.</p>

          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0;background:#F6F2EA;border:1px solid #D6CFC0">
            <tr><td style="padding:18px 20px">
              <div style="font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.14em;color:#8A8478;text-transform:uppercase;margin-bottom:8px">Your submission</div>
              ${lead.company ? `<div style="font-size:14px;margin:2px 0"><strong>Company:</strong> ${esc(lead.company)}</div>` : ""}
              ${lead.project_location ? `<div style="font-size:14px;margin:2px 0"><strong>Location:</strong> ${esc(lead.project_location)}</div>` : ""}
              ${lead.project_type ? `<div style="font-size:14px;margin:2px 0"><strong>Project type:</strong> ${esc(lead.project_type)}</div>` : ""}
              ${lead.opening_count ? `<div style="font-size:14px;margin:2px 0"><strong>Openings:</strong> ${esc(lead.opening_count)}</div>` : ""}
              ${lead.timeline ? `<div style="font-size:14px;margin:2px 0"><strong>Timeline:</strong> ${esc(lead.timeline)}</div>` : ""}
            </td></tr>
          </table>

          <p style="margin:0 0 6px;font-size:15px;line-height:1.55;color:#2A2620">Need us? <a href="tel:+18186690985" style="color:#C4552A;text-decoration:none"><strong>818-669-0985</strong></a></p>
          <p style="margin:0;font-size:15px;line-height:1.55;color:#2A2620">Or reply to this email directly.</p>
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid #D6CFC0;background:#F6F2EA">
          <div style="font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.12em;color:#8A8478;text-transform:uppercase">Lone State Builders Co. · Sugar Land, TX · Serving all of Texas</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function teamHtml(lead: any, urls: {path:string;url:string}[]): string {
  const fileRows = urls.length
    ? urls.map(u => `<tr><td style="padding:8px 0;border-bottom:1px solid #2A2620;font-family:ui-monospace,Menlo,monospace;font-size:12px"><a href="${esc(u.url)}" style="color:#C4552A;text-decoration:none">${esc(u.path.split("/").pop())}</a><div style="font-size:10px;color:#8A8478;margin-top:2px">${esc(u.path)}</div></td></tr>`).join("")
    : `<tr><td style="padding:8px 0;font-size:12px;color:#8A8478;font-style:italic">No files attached.</td></tr>`;

  const field = (k: string, v: any) => v ? `<tr><td style="padding:6px 12px 6px 0;vertical-align:top;font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.14em;color:#8A8478;text-transform:uppercase;width:120px">${esc(k)}</td><td style="padding:6px 0;font-size:14px;color:#141210">${esc(v)}</td></tr>` : "";

  return `
<!doctype html>
<html><body style="margin:0;padding:0;background:#141210;font-family:-apple-system,Segoe UI,Inter,sans-serif;color:#EFEAE1">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#141210;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;background:#1E1B17;border:1px solid #2B2721">
        <tr><td style="padding:24px 28px;border-bottom:1px solid #2B2721;background:#C4552A">
          <div style="font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.14em;color:#fff;text-transform:uppercase;opacity:.75">New lead · ${new Date(lead.created_at || Date.now()).toLocaleString("en-US", { timeZone: "America/Chicago" })} CT</div>
          <div style="font-family:Georgia,serif;font-size:26px;color:#fff;margin-top:4px">${esc(lead.name)}${lead.company ? ` · <span style="opacity:.85">${esc(lead.company)}</span>` : ""}</div>
        </td></tr>
        <tr><td style="padding:28px;background:#F6F2EA;color:#141210">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            ${field("Name", lead.name)}
            ${field("Company", lead.company)}
            ${field("Email", lead.email)}
            ${field("Phone", lead.phone)}
            ${field("Location", lead.project_location)}
            ${field("Project type", lead.project_type)}
            ${field("Openings", lead.opening_count)}
            ${field("Timeline", lead.timeline)}
            ${lead.notes ? `<tr><td colspan="2" style="padding:14px 0 4px;font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.14em;color:#8A8478;text-transform:uppercase">Notes</td></tr><tr><td colspan="2" style="padding:0 0 8px;font-size:14px;line-height:1.55;color:#2A2620;white-space:pre-wrap">${esc(lead.notes)}</td></tr>` : ""}
          </table>
        </td></tr>
        <tr><td style="padding:24px 28px;background:#1E1B17;border-top:1px solid #2B2721">
          <div style="font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.14em;color:#8A8478;text-transform:uppercase;margin-bottom:10px">Blueprints · ${urls.length} file${urls.length === 1 ? "" : "s"} · ${fmtBytes(Number(lead.total_bytes || 0))} · links valid 14 days</div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${fileRows}</table>
        </td></tr>
        <tr><td style="padding:14px 28px;background:#141210;border-top:1px solid #2B2721">
          <div style="font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.12em;color:#5B564C">Reply directly to reach ${esc(lead.email)} · Lead id: ${esc(lead.id || "—")}</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return new Response("Method not allowed", { status: 405, headers: CORS });

  try {
    const { lead_id } = await req.json();
    if (!lead_id) throw new Error("Missing lead_id");

    // Load full lead row with service role (bypasses RLS)
    const { data: lead, error: lerr } = await admin
      .from("leads").select("*").eq("id", lead_id).single();
    if (lerr || !lead) throw new Error(lerr?.message || "Lead not found");

    const urls = await signedUrls(lead.file_paths ?? []);

    const fromHeader = `${FROM_NAME} <${FROM_EMAIL}>`;

    // (1) Welcome email to uploader
    if (lead.email) {
      await resendSend({
        from: fromHeader,
        to: [lead.email],
        reply_to: FROM_EMAIL,
        subject: `We've got your plans, ${String(lead.name).split(" ")[0]} — Lone State Builders`,
        html: welcomeHtml(lead),
      });
    }

    // (2) Team notification
    await resendSend({
      from: fromHeader,
      to: TEAM_EMAILS,
      reply_to: lead.email || FROM_EMAIL,
      subject: `[Lead] ${lead.name}${lead.company ? " · " + lead.company : ""}${lead.project_location ? " · " + lead.project_location : ""}`,
      html: teamHtml(lead, urls),
    });

    // Mark the row as notified
    await admin.from("leads").update({ status: "notified" }).eq("id", lead_id);

    return new Response(JSON.stringify({ ok: true, team: TEAM_EMAILS.length, files: urls.length }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message ?? err) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
