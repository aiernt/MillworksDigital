// Cloudflare Worker entry point (see wrangler.jsonc).
//
// The site itself is plain static files served by Workers Static Assets. This
// script only runs for /api/*:
//   GET  /api/contact  hands out the contact form's math question
//   POST /api/contact  checks the form (honeypot + math answer) and relays the
//                      note to the inbox through Resend (https://resend.com)
// The Resend API key lives only in Cloudflare (never in the page or this folder).
//
// Settings (Cloudflare dashboard -> Workers & Pages -> millworksdigital -> Settings ->
// Variables and Secrets):
//   RESEND_API_KEY  (secret)  your Resend API key
//   CONTACT_TO      (text)    address(es) that receive notes, comma-separated
//   CONTACT_FROM    (text)    sender, e.g. "Millworks Digital Website <website@millworksdigital.com>"
//                             (the domain must be verified in Resend)
//   FORM_SECRET     (secret, optional)  signs the math questions; falls back to RESEND_API_KEY

const MAX = { name: 120, email: 200, phone: 60, business: 160, notes: 4000 };

// The "What do you need?" choices on the form; anything else is ignored.
const NEEDS = [
  "a new website",
  "an online store",
  "a redesign of my current site",
  "a custom tool or dashboard",
  "automation or integrations",
  "support for a site or app I already have",
  "figuring out what I need",
];

// People take more than a few seconds to fill in the form, and a question stays good for two hours.
const MIN_FILL_MS = 3000;
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const clean = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
// Single-line text for headers like the subject: no CR/LF so nothing can inject headers.
const oneLine = (v) => v.replace(/[\r\n]+/g, " ");
const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// The math question needs no storage: its token is the time it was issued plus an
// HMAC signature over the correct answer, so only this worker can make or check one.
const encoder = new TextEncoder();
const formSecret = (env) => env.FORM_SECRET || env.RESEND_API_KEY;

async function sign(secret, message) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
  return btoa(String.fromCharCode(...mac)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Constant-time comparison, so response timing gives nothing away about the signature.
function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function newQuestion(env) {
  const a = 2 + Math.floor(Math.random() * 8); // 2-9
  const b = 1 + Math.floor(Math.random() * 9); // 1-9
  const issued = Date.now();
  return { a, b, token: `${issued}.${await sign(formSecret(env), `${a + b}:${issued}`)}` };
}

async function answerIsRight(env, token, answer) {
  const [issuedText, signature] = String(token || "").split(".");
  const issued = Number(issuedText);
  const age = Date.now() - issued;
  const n = Number.parseInt(String(answer ?? "").trim(), 10);
  if (!issued || !signature || !Number.isFinite(n) || age < MIN_FILL_MS || age > MAX_AGE_MS) return false;
  return sameText(await sign(formSecret(env), `${n}:${issued}`), signature);
}

async function handleContact(request, env) {
  if (!env.RESEND_API_KEY || !env.CONTACT_TO || !env.CONTACT_FROM) {
    console.error("Contact form: RESEND_API_KEY, CONTACT_TO or CONTACT_FROM is not set");
    return json({ ok: false, error: "The contact form isn't set up yet." }, 500);
  }
  if (request.method === "GET") return json({ ok: true, ...(await newQuestion(env)) });
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  // Only accept posts that come from this site's own pages.
  const origin = request.headers.get("Origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return json({ ok: false, error: "Forbidden" }, 403);
  }

  let data;
  try {
    const text = await request.text();
    if (text.length > 20000) return json({ ok: false, error: "Message too large." }, 413);
    data = JSON.parse(text);
  } catch {
    return json({ ok: false, error: "Invalid request." }, 400);
  }
  if (!data || typeof data !== "object") return json({ ok: false, error: "Invalid request." }, 400);

  // Honeypot: a real visitor never fills this. Pretend it worked, send nothing.
  if (data.website) return json({ ok: true });

  if (!(await answerIsRight(env, data.token, data.answer))) {
    return json({ ok: false, retry: true, error: "That answer doesn't look right. Please try the new question." }, 400);
  }

  const f = {
    name: clean(data.name, MAX.name),
    email: clean(data.email, MAX.email),
    phone: clean(data.phone, MAX.phone),
    business: clean(data.business, MAX.business),
    notes: clean(data.notes, MAX.notes),
  };
  const needs = Array.isArray(data.needs) ? NEEDS.filter((n) => data.needs.includes(n)) : [];
  if (!f.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) {
    return json({ ok: false, error: "Please add your name and a valid email so I can reply." }, 400);
  }
  if (!needs.length && !f.notes) {
    return json({ ok: false, error: "Choose what you need, or add a few lines about the project." }, 400);
  }

  const rows = [
    ["Name", f.name],
    ["Email", f.email],
    ["Phone", f.phone || "-"],
    ["Business", f.business || "-"],
    ["Looking for", needs.map(capitalize).join(", ") || "-"],
  ];
  const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n") + `\n\nAbout the project:\n${f.notes || "-"}\n`;
  const html =
    `<h2>New project inquiry</h2><table cellpadding="6" style="border-collapse:collapse">` +
    rows.map(([k, v]) => `<tr><td><b>${k}</b></td><td>${escapeHtml(v)}</td></tr>`).join("") +
    `</table><h3>About the project</h3><p style="white-space:pre-wrap">${escapeHtml(f.notes || "-")}</p>` +
    `<p style="color:#777">Reply to this email to answer ${escapeHtml(f.name)} directly.</p>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.CONTACT_FROM,
      to: env.CONTACT_TO.split(",").map((s) => s.trim()).filter(Boolean),
      reply_to: f.email,
      subject: oneLine(`New project inquiry from ${f.name}${f.business ? ` (${f.business})` : ""}`).slice(0, 150),
      text,
      html,
    }),
  });

  if (!res.ok) {
    console.error("Resend error", res.status, await res.text());
    return json({ ok: false, error: "Couldn't send your note." }, 502);
  }
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/contact") return handleContact(request, env);
    // Everything else is the static site.
    return env.ASSETS.fetch(request);
  },
};
