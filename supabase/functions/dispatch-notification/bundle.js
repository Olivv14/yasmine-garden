// supabase/functions/dispatch-notification/index.ts
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

// push/protocol.mjs
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var VENDORS = Object.freeze(["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"]);
function decodeKey(value, size) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid push key");
  const bytes = Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4)), (c) => c.charCodeAt(0));
  if (bytes.length !== size || encodeKey(bytes) !== value || size === 65 && bytes[0] !== 4) throw new Error("Invalid push key");
  return bytes;
}
function encodeKey(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function endpointURL(value) {
  if (typeof value !== "string" || value.length > 2048 || !/^https:\/\/[a-z.]+\/[A-Za-z0-9_./~-]+$/.test(value) || /(^|\/)\.{1,2}(\/|$)/.test(value)) throw new Error("Invalid push endpoint");
  const url = new URL(value);
  if (!VENDORS.includes(url.hostname) || url.port || url.username || url.password || url.search || url.hash) throw new Error("Invalid push endpoint");
  return url;
}
function appURL(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !url.pathname.endsWith("/")) throw new Error("Invalid public app URL");
  return url;
}
function dispatchBody(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).join(",") !== "event_id" || !UUID.test(value.event_id)) throw new Error("Invalid dispatch body");
  return value.event_id;
}
function validatePayload(p) {
  if (!p || p.version !== 1 || !UUID.test(p.event_id) || !["en", "es", "fr", "it", "aeb-TN"].includes(p.locale) || typeof p.title !== "string" || !p.title || p.title.length > 160 || typeof p.body !== "string" || !p.body || p.body.length > 500 || typeof p.preview !== "boolean") throw new Error("Invalid push payload");
  return p;
}

// push/catalogs.mjs
var PHRASES = Object.freeze({
  en: [
    "{{sender}} is sending a little warmth your way.",
    "A small hello from {{sender}}, just for you.",
    "{{sender}} has a gentle thought for you.",
    "A little flower from {{sender}} for your day.",
    "{{sender}} is cheering you on from here.",
    "{{sender}} is keeping a little light on for you.",
    "A quiet wave from {{sender}}, whenever you see this.",
    "{{sender}} hopes a little softness finds you today.",
    "{{sender}} is sending a smile, no reply needed.",
    "A small pause, a warm thought: from {{sender}} to you."
  ],
  es: [
    "{{sender}} te manda un poquito de cari\xF1o.",
    "Un saludito de {{sender}}, solo para ti.",
    "{{sender}} tiene un pensamiento tierno para ti.",
    "Una florecita de {{sender}} para tu d\xEDa.",
    "{{sender}} te da \xE1nimos desde aqu\xED.",
    "{{sender}} te guarda una lucecita encendida.",
    "Un saludo tranquilo de {{sender}}, para cuando lo veas.",
    "{{sender}} espera que hoy te llegue un poco de ternura.",
    "{{sender}} te manda una sonrisa, no hace falta responder.",
    "Una pausa peque\xF1a, un pensamiento c\xE1lido: de {{sender}} para ti."
  ],
  fr: [
    "{{sender}} t\u2019envoie un peu de douceur.",
    "Un petit coucou de {{sender}}, rien que pour toi.",
    "{{sender}} a une pens\xE9e tendre pour toi.",
    "Une petite fleur de {{sender}} pour ta journ\xE9e.",
    "{{sender}} t\u2019encourage d\u2019ici.",
    "{{sender}} garde une petite lumi\xE8re pour toi.",
    "Un petit signe de {{sender}}, quand tu verras ce message.",
    "{{sender}} te souhaite un peu de douceur aujourd\u2019hui.",
    "{{sender}} t\u2019envoie un sourire, sans attendre de r\xE9ponse.",
    "Une petite pause, une pens\xE9e chaleureuse : de {{sender}} pour toi."
  ],
  it: [
    "{{sender}} ti manda un po\u2019 di calore.",
    "Un piccolo ciao da {{sender}}, solo per te.",
    "{{sender}} ha un pensiero dolce per te.",
    "Un piccolo fiore da {{sender}} per la tua giornata.",
    "{{sender}} fa il tifo per te da qui.",
    "{{sender}} tiene accesa una piccola luce per te.",
    "Un saluto silenzioso da {{sender}}, quando lo vedrai.",
    "{{sender}} spera che oggi ti raggiunga un po\u2019 di dolcezza.",
    "{{sender}} ti manda un sorriso, non serve rispondere.",
    "Una piccola pausa, un pensiero caldo: da {{sender}} a te."
  ],
  "aeb-TN": [
    "{{sender}} \u064A\u0628\u0639\u062B\u0644\u0643 \u0634\u0648\u064A\u0629 \u062D\u0646\u0627\u0646.",
    "\u0633\u0644\u0627\u0645 \u0635\u063A\u064A\u0631 \u0645\u0646 {{sender}}\u060C \u0644\u064A\u0643 \u0625\u0646\u062A \u0628\u0631\u0643.",
    "{{sender}} \u062E\u0645\u0651\u0645 \u0641\u064A\u0643 \u0628\u0643\u0644 \u062D\u0646\u0627\u0646.",
    "\u0648\u0631\u062F\u0629 \u0635\u063A\u064A\u0631\u0629 \u0645\u0646 {{sender}} \u0644\u0646\u0647\u0627\u0631\u0643.",
    "{{sender}} \u064A\u0634\u062C\u0651\u0639 \u0641\u064A\u0643 \u0645\u0646 \u0644\u0647\u0646\u0627.",
    "{{sender}} \u0645\u062E\u0644\u0651\u064A\u0644\u0643 \u0636\u0648 \u0635\u063A\u064A\u0631.",
    "\u0625\u0634\u0627\u0631\u0629 \u0635\u063A\u064A\u0631\u0629 \u0645\u0646 {{sender}}\u060C \u0648\u0642\u062A \u0627\u0644\u0644\u064A \u062A\u0634\u0648\u0641\u0647\u0627.",
    "{{sender}} \u064A\u062A\u0645\u0646\u0651\u0627\u0644\u0643 \u0634\u0648\u064A\u0629 \u0631\u0627\u062D\u0629 \u0627\u0644\u064A\u0648\u0645.",
    "{{sender}} \u064A\u0628\u0639\u062B\u0644\u0643 \u0636\u062D\u0643\u0629\u060C \u0645\u0648\u0634 \u0644\u0627\u0632\u0645 \u062A\u062C\u0627\u0648\u0628.",
    "\u0648\u0642\u0641\u0629 \u0635\u063A\u064A\u0631\u0629 \u0648\u0641\u0643\u0631\u0629 \u062F\u0627\u0641\u064A\u0629\u060C \u0645\u0646 {{sender}} \u0644\u064A\u0643."
  ]
});
var COPY = Object.freeze({ en: { title: "Notifications", generic: "You have a new notification." }, es: { title: "Notificaciones", generic: "Tienes una notificaci\xF3n nueva." }, fr: { title: "Notifications", generic: "Vous avez une nouvelle notification." }, it: { title: "Notifiche", generic: "Hai una nuova notifica." }, "aeb-TN": { title: "\u0627\u0644\u062A\u0646\u0628\u064A\u0647\u0627\u062A", generic: "\u0639\u0646\u062F\u0643 \u062A\u0646\u0628\u064A\u0647 \u062C\u062F\u064A\u062F." } });
var KINDS = Object.freeze({
  "en": Object.freeze({ message: "{{sender}} sent you a message", dedication: "{{sender}} dedicated a song to you", song_added: "{{sender}} added a song", game_invite: "{{sender}} wants to play", game_turn: "Your turn against {{sender}}", teach_card: "{{sender}} taught you a word" }),
  "es": Object.freeze({ message: "{{sender}} te mand\xF3 un mensaje", dedication: "{{sender}} te dedic\xF3 una canci\xF3n", song_added: "{{sender}} agreg\xF3 una canci\xF3n", game_invite: "{{sender}} quiere jugar", game_turn: "Te toca contra {{sender}}", teach_card: "{{sender}} te ense\xF1\xF3 una palabra" }),
  "fr": Object.freeze({ message: "{{sender}} vous a envoy\xE9 un message", dedication: "{{sender}} vous a d\xE9di\xE9 une chanson", song_added: "{{sender}} a ajout\xE9 une chanson", game_invite: "{{sender}} veut jouer", game_turn: "\xC0 vous de jouer contre {{sender}}", teach_card: "{{sender}} vous a appris un mot" }),
  "it": Object.freeze({ message: "{{sender}} ti ha mandato un messaggio", dedication: "{{sender}} ti ha dedicato una canzone", song_added: "{{sender}} ha aggiunto una canzone", game_invite: "{{sender}} vuole giocare", game_turn: "Tocca a te contro {{sender}}", teach_card: "{{sender}} ti ha insegnato una parola" }),
  "aeb-TN": Object.freeze({ message: "{{sender}} \u0628\u0639\u062B\u0644\u0643 \u0645\u064A\u0633\u0627\u062C", dedication: "{{sender}} \u0647\u062F\u0627\u0643 \u0623\u063A\u0646\u064A\u0629", song_added: "{{sender}} \u0632\u0627\u062F \u0623\u063A\u0646\u064A\u0629", game_invite: "{{sender}} \u064A\u062D\u0628 \u064A\u0644\u0639\u0628", game_turn: "\u062F\u0648\u0631\u0643 \u0636\u062F {{sender}}", teach_card: "{{sender}} \u0639\u0644\u0651\u0645\u0643 \u0643\u0644\u0645\u0629" })
});

// push/payload.mjs
function buildNotificationPayload(id, target) {
  if (!Object.hasOwn(KINDS, target.locale) || !Object.hasOwn(KINDS[target.locale], target.kind) || typeof target.sender !== "string" || target.sender.length < 1 || [...target.sender].length > 80 || typeof target.preview !== "boolean" || target.text != null && (typeof target.text !== "string" || target.text.length > 140)) throw new Error("Invalid push target");
  const line = KINDS[target.locale][target.kind].replace("{{sender}}", () => target.sender), text = COPY[target.locale];
  return validatePayload({
    version: 1,
    event_id: id,
    locale: target.locale,
    preview: target.preview,
    title: target.preview ? line : text.title,
    body: target.preview ? target.text?.trim() || line : text.generic
  });
}

// supabase/functions/_shared/push-handler.ts
function requiredEnvironment(get) {
  const names = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_CONTACT", "PUBLIC_APP_URL"];
  const env = Object.fromEntries(names.map((name) => {
    const value = get(name);
    if (!value) throw new Error("Missing required environment: " + name);
    return [name, value];
  }));
  const project = new URL(env.SUPABASE_URL);
  if (project.protocol !== "https:" || project.username || project.password || project.search || project.hash || project.pathname !== "/") throw new Error("Invalid Supabase URL");
  appURL(env.PUBLIC_APP_URL);
  decodeKey(env.VAPID_PUBLIC_KEY, 65);
  decodeKey(env.VAPID_PRIVATE_KEY, 32);
  const contact = new URL(env.VAPID_CONTACT);
  if (!["https:", "mailto:"].includes(contact.protocol) || contact.username || contact.password || !contact.pathname || /[\s\r\n]/.test(env.VAPID_CONTACT)) throw new Error("Invalid VAPID contact");
  return env;
}

// supabase/functions/_shared/notification-handler.ts
function createNotificationHandler(deps) {
  const allowedOrigin = appURL(deps.appUrl).origin;
  return async (request) => {
    const origin = request.headers.get("Origin");
    const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin", ...origin === allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin } : {} };
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
    if (origin && origin !== allowedOrigin) return reply(403, { error: "origin_denied" });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...headers, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info" } });
    if (request.method !== "POST") return reply(405, { error: "method_not_allowed" });
    const auth = request.headers.get("Authorization");
    if (!auth || !/^Bearer [A-Za-z0-9._~-]+$/.test(auth) || auth.length > 8192) return reply(401, { error: "authentication_required" });
    let userId;
    try {
      userId = await deps.authenticate(auth.slice(7));
    } catch {
      userId = null;
    }
    if (!userId) return reply(401, { error: "authentication_required" });
    let id;
    try {
      if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) throw new Error("content type");
      const text = await request.text();
      if (text.length > 256) throw new Error("size");
      id = dispatchBody(JSON.parse(text));
    } catch {
      return reply(400, { error: "invalid_request" });
    }
    try {
      const service = await deps.privileged();
      const claim = await service.rpc("push_claim_notification", { p_id: id, p_sender_auth: userId });
      if (claim.error) {
        const code = claim.error.code;
        if (code === "42501") return reply(403, { error: "not_your_notification" });
        throw new Error("claim failed");
      }
      if (!Array.isArray(claim.data) || claim.data.length > 5) throw new Error("claim shape");
      await Promise.all(claim.data.map(async (target) => {
        let outcome = "rejected";
        let payload;
        try {
          payload = buildNotificationPayload(id, target);
        } catch {
          outcome = "rejected";
        }
        if (payload) {
          try {
            outcome = await service.send(target, payload);
          } catch {
            outcome = "retry";
          }
        }
        const complete = await service.rpc("push_complete_notification", { p_id: id, p_subscription_id: target.subscription_id, p_lease_token: target.lease_token, p_outcome: outcome });
        if (complete.error || complete.data !== true) throw new Error("completion not committed");
      }));
      const status = await service.rpc("push_status_notification", { p_id: id });
      if (status.error) throw new Error("status failed");
      return reply(200, { push: status.data, device_displayed: "unknown" });
    } catch {
      return reply(503, { error: "push_dispatch_incomplete", retry_same_event: true, device_displayed: "unknown" });
    }
  };
}

// supabase/functions/_shared/push-transport.ts
import { ApplicationServer, importVapidKeys } from "jsr:@negrel/webpush@0.5.0";
import { encrypt } from "jsr:@negrel/http-ece@0.7.0";
async function createPushSender(config, fetcher = fetch) {
  const raw = decodeKey(config.publicKey, 65);
  const privateRaw = decodeKey(config.privateKey, 32);
  const publicJwk = { kty: "EC", crv: "P-256", x: encodeKey(raw.slice(1, 33)), y: encodeKey(raw.slice(33, 65)), ext: true };
  const vapidKeys = await importVapidKeys({ publicKey: publicJwk, privateKey: { ...publicJwk, d: encodeKey(privateRaw) } });
  const probe = new TextEncoder().encode("push-key-pair-check");
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, vapidKeys.privateKey, probe);
  if (!await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, vapidKeys.publicKey, signature, probe)) throw new Error("Invalid VAPID configuration");
  return async (target, payload) => {
    endpointURL(target.endpoint);
    decodeKey(target.p256dh, 65);
    decodeKey(target.auth, 16);
    const content = new TextEncoder().encode(JSON.stringify(payload));
    if (content.length > 3e3) throw new Error("Push payload too large");
    const server = await ApplicationServer.new({ contactInformation: config.contact, vapidKeys });
    const subscriber = server.subscribe({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } });
    const hkdfKey = await crypto.subtle.importKey("raw", await subscriber.getEcdhSecret(), "HKDF", false, ["deriveBits"]);
    const ikm = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: subscriber.authSecret(), info: new Uint8Array(await subscriber.getKeyInfo()).buffer }, hkdfKey, 256);
    const body = await encrypt(content.buffer, ikm, { header: { keyid: await server.getPublicKeyRaw() } });
    try {
      const response = await fetcher(target.endpoint, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(8e3),
        headers: {
          "Content-Encoding": "aes128gcm",
          "Content-Type": "application/octet-stream",
          TTL: "300",
          Urgency: "normal",
          Authorization: `vapid t=${await subscriber.forgeVapidToken()}, k=${config.publicKey}`
        },
        body
      });
      const status = response.status;
      await response.body?.cancel();
      if (status >= 200 && status < 300) return "accepted";
      if (status === 404 || status === 410) return "gone";
      if (status === 408 || status === 429 || status >= 500) return "retry";
      return "rejected";
    } catch {
      return "retry";
    }
  };
}

// supabase/functions/dispatch-notification/index.ts
Deno.serve(async (request) => {
  try {
    const env = requiredEnvironment((name) => Deno.env.get(name));
    const handler = createNotificationHandler({
      appUrl: env.PUBLIC_APP_URL,
      authenticate: async (token) => {
        const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { headers: { Authorization: "Bearer " + token }, fetch: (input, init) => fetch(input, { ...init, redirect: "error", signal: AbortSignal.timeout(1e4) }) } });
        const { data, error } = await client.auth.getUser(token);
        if (error || !data.user) return null;
        return data.user.id;
      },
      privileged: async () => {
        const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (input, init) => fetch(input, { ...init, redirect: "error", signal: AbortSignal.timeout(1e4) }) } });
        const send = await createPushSender({ publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, contact: env.VAPID_CONTACT });
        return { rpc: (async (name, args) => await client.rpc(name, args)), send };
      }
    });
    return await handler(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const missing = message.match(/^Missing required environment: ([A-Z_]+)$/)?.[1];
    return new Response(JSON.stringify(missing ? { error: "push_environment_missing", required_key: missing } : { error: "push_runtime_configuration_required" }), { status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }
});
