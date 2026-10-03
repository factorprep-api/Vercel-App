// Paddle MoR webhook — FactorPrep v1.5.0
// Receives Paddle events, verifies the signature, logs the event once
// (idempotency), and writes entitlements / coach-role changes.
//
// Deploy:
//   supabase functions deploy paddle-webhook
//   supabase secrets set PADDLE_WEBHOOK_SECRET=pdl_ntfset_...
// Paddle dashboard → Developer Tools → Notifications:
//   URL:    https://<project-ref>.supabase.co/functions/v1/paddle-webhook
//   Events: transaction.completed, subscription.activated,
//           subscription.updated, subscription.canceled
//
// The function uses the service role (auto-injected), which bypasses RLS:
// athletes can never self-grant entitlements.
// @ts-nocheck
import { createClient } from 'jsr:@supabase/supabase-js@2';

const WEBHOOK_SECRET = Deno.env.get('PADDLE_WEBHOOK_SECRET') ?? '';

// Paddle signature: "ts=<unix>;h1=<hex hmac-sha256 of 'ts:body'>"
async function hmacHex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const STATUS_MAP: Record<string, string> = {
  active: 'active',
  trialing: 'active',
  past_due: 'past_due',
  paused: 'past_due',
  canceled: 'canceled',
  cancelled: 'canceled',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Match the buyer: custom_data.athlete_id first, then customer email.
async function findAthleteId(sb, athleteId, email): Promise<string | null> {
  if (athleteId) {
    const { data } = await sb.from('athletes').select('id').eq('id', athleteId).maybeSingle();
    if (data) return data.id;
  }
  if (email) {
    const { data } = await sb.from('athletes').select('id').ilike('email', email).limit(1);
    if (data && data.length > 0) return data[0].id;
  }
  return null;
}

// The product being bought: price id first, custom slug fallback.
async function findProduct(sb, priceId, slug) {
  if (priceId) {
    const { data } = await sb.from('shop_products').select('*').eq('paddle_price_id', priceId).maybeSingle();
    if (data) return data;
  }
  if (slug) {
    const { data } = await sb.from('shop_products').select('*').eq('slug', slug).maybeSingle();
    if (data) return data;
  }
  return null;
}

async function upsertEntitlement(sb, athleteId, product, fields) {
  const row = {
    athlete_id: athleteId,
    product_id: product.id,
    ...fields,
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb
    .from('user_entitlements')
    .upsert(row, { onConflict: 'athlete_id,product_id' });
  if (error) throw new Error(`entitlement upsert failed: ${error.message}`);
}

async function setCoachRole(sb, athleteId, coach) {
  const { error } = await sb.from('athletes').update({ role: coach ? 'coach' : 'athlete' }).eq('id', athleteId);
  if (error) throw new Error(`role update failed: ${error.message}`);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!WEBHOOK_SECRET) return json({ error: 'PADDLE_WEBHOOK_SECRET not configured' }, 500);

  const rawBody = await req.text();
  const header = req.headers.get('paddle-signature') ?? '';
  const parts: Record<string, string> = {};
  for (const chunk of header.split(';')) {
    const [k, v] = chunk.split('=');
    if (k && v) parts[k.trim()] = v.trim();
  }
  if (!parts.ts || !parts.h1) return json({ error: 'Invalid signature header' }, 400);

  const expected = await hmacHex(WEBHOOK_SECRET, `${parts.ts}:${rawBody}`);
  if (!timingSafeEqual(expected, parts.h1)) return json({ error: 'Invalid signature' }, 401);

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: 'Bad JSON' }, 400);
  }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Idempotency: log the event first. If it already exists, Paddle is
  // retrying something we already processed — acknowledge and stop.
  const { error: logErr, data: logged } = await sb
    .from('paddle_webhook_events')
    .upsert(
      { id: event.event_id, event_type: event.event_type, payload: event },
      { onConflict: 'id', ignoreDuplicates: true }
    )
    .select('id')
    .maybeSingle();
  if (logErr) console.error('event log error:', logErr);
  if (!logged) return json({ ok: true, duplicate: true });

  try {
    if (event.event_type === 'transaction.completed') {
      await handleTransaction(sb, event.data ?? {});
    } else if (event.event_type.startsWith('subscription.')) {
      await handleSubscription(sb, event.data ?? {}, event.event_type);
    }
    // Anything else is acknowledged and ignored.
  } catch (e) {
    console.error('fulfilment error:', e);
    return json({ error: String(e) }, 500);
  }

  return json({ ok: true });
});

// transaction.completed: one-time buys → 'lifetime'; subscription
// first payments → 'active' (subscription id attached); manual products
// and Free-tier-only events are logged and ignored.
async function handleTransaction(sb, data) {
  const items = data.items ?? [];
  const priceId = items[0]?.price?.id ?? null;
  const custom = data.custom_data ?? {};
  const email = data.customer?.email ?? custom.email ?? null;

  const product = await findProduct(sb, priceId, custom.product_slug);
  if (!product) {
    console.warn('transaction.completed: no matching product', priceId);
    return;
  }
  if (product.fulfilment === 'manual') {
    console.info(`product "${product.slug}" is manual — admin fulfils`);
    return;
  }

  const athleteId = await findAthleteId(sb, custom.athlete_id, email);
  if (!athleteId) {
    console.error('transaction.completed: cannot match athlete', email);
    return;
  }

  if (product.product_type === 'one_time') {
    await upsertEntitlement(sb, athleteId, product, {
      status: 'lifetime',
      paddle_transaction_id: data.id ?? null,
      paddle_subscription_id: null,
      canceled_at: null,
    });
  } else {
    await upsertEntitlement(sb, athleteId, product, {
      status: 'active',
      paddle_transaction_id: data.id ?? null,
      paddle_subscription_id: data.subscription_id ?? null,
      canceled_at: null,
    });
  }

  if (product.grants_coach_role) {
    await setCoachRole(sb, athleteId, true);
  }
}

// subscription.*: keep the ledger in sync with Paddle's subscription
// lifecycle, and demote the coach role on cancel.
async function handleSubscription(sb, data, eventType) {
  const items = data.items ?? [];
  const priceId = items[0]?.price?.id ?? null;
  const custom = data.custom_data ?? {};
  const email = data.customer?.email ?? custom.email ?? null;

  const product = await findProduct(sb, priceId, custom.product_slug);
  if (!product || product.fulfilment === 'manual') return;

  const athleteId = await findAthleteId(sb, custom.athlete_id, email);
  if (!athleteId) {
    console.error(`${eventType}: cannot match athlete`, email);
    return;
  }

  // subscription.created has no meaningful status — skip it.
  if (eventType === 'subscription.created' && !data.status) return;

  const status = STATUS_MAP[(data.status ?? '').toLowerCase()] ?? null;
  if (!status) return;

  await upsertEntitlement(sb, athleteId, product, {
    status,
    paddle_subscription_id: data.id ?? null,
    canceled_at: status === 'canceled' ? new Date().toISOString() : null,
  });

  if (product.grants_coach_role) {
    if (status === 'canceled') {
      await setCoachRole(sb, athleteId, false);
    } else if (status === 'active') {
      // Safety net in case transaction.completed was missed.
      await setCoachRole(sb, athleteId, true);
    }
  }
}