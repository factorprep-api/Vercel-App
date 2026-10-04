# Paddle Onboarding Checklist (FactorPrep Shop)

The shop is fully built and runs in **demo mode** until Paddle is connected.
Follow these steps in order when you create your Paddle account.

---

## 1. Create the products in Paddle

Paddle dashboard → **Catalog → Products → New product**.
Create each product, then add a price to it and copy the **price id**
(`pri_...`) — you'll paste those in step 3.

| Paddle product name      | Price                | Billing     | FactorPrep slug |
|--------------------------|----------------------|-------------|-----------------|
| FactorPrep — All-In Pods | $10.00 USD           | Monthly     | `pods`          |
| FactorPrep — Coaching Kit| $15.00 USD           | Monthly     | `coaching-kit`  |
| FactorPrep — Team Plan   | $150.00 USD          | Monthly     | `team`          |
| FactorPrep — Club Plan   | (no price — sold POA)| —           | `club`          |

Rehab / injury prevention plans are one-time purchases you add yourself in
the admin panel (see step 5). For each one, also create a matching one-time
price in Paddle (e.g. "Full Knee Rehab Protocol — $20.00").

> Tip: do the first pass in the **sandbox** account to test end-to-end, then
> repeat in the live account.

## 2. Point the webhook at Supabase

Paddle dashboard → **Developer Tools → Notifications → New notification**:

- URL: `https://<your-project-ref>.supabase.co/functions/v1/paddle-webhook`
- Events: `transaction.completed`, `subscription.activated`,
  `subscription.updated`, `subscription.canceled`
- Copy the **notification destination secret** (`pdl_ntfset_...`).

Then deploy the edge function and set the secret:

```bash
supabase functions deploy paddle-webhook
supabase secrets set PADDLE_WEBHOOK_SECRET=pdl_ntfset_xxxxxxxx
```

## 3. Connect the frontend

Add to your `.env` (and your host's env vars):

```
VITE_PADDLE_CLIENT_TOKEN=pdl_pt_...      # Paddle → Developer tools → Authentication
VITE_PADDLE_ENV=sandbox                  # remove this line when going live
```

Then paste each `pri_...` price id into the catalog:

- **Easiest:** Admin Hub → **Manage** pill → Products & Plans → Edit →
  "Paddle price id" → Save.
- Or via SQL:
  ```sql
  update public.shop_products set paddle_price_id = 'pri_01h...' where slug = 'pods';
  update public.shop_products set paddle_price_id = 'pri_01h...' where slug = 'coaching-kit';
  ```

The yellow "Demo mode" banner on /shop disappears as soon as
`VITE_PADDLE_CLIENT_TOKEN` is set.

## 4. Test the loop (sandbox)

1. Sign in as a test athlete with no pods → pod cards should be hidden.
2. Shop → All-In Pods → Get Started → pay with Paddle's sandbox card.
3. Within seconds (the shop polls at 3s/6s/12s), the pod cards appear on
   the Athlete Hub.
4. Check `user_entitlements` has a row with status `active` and the webhook
   log table has the event.
5. Buy a Coaching Kit with a test account → role flips to `coach`
   (Coach Hub appears after the next role re-fetch / login).
6. Cancel the subscription in Paddle → webhook sets status `canceled` and
   demotes the role; pods disappear on next hub sync.

## 5. Ongoing admin workflow (no Paddle needed)

- **Add a rehab/prevention plan:** create the program in the app first,
  then Manage Shop → Products & Plans → fill the form (type = one-time,
  link the program, price `$20`) → Save. It appears on /shop immediately.
- **Give someone pods / a plan manually:** Manage Shop → Grants → pick
  athlete + product → Grant (lifetime). Revoke removes it.
- **Team/Club plans** are `manual` fulfilment: the shop shows "Contact Us"
  and you fulfil via the Grants tab.
- Old fallback removed: an athlete with **no** pods simply doesn't see the
  pod cards anymore (previously they saw all three by default).

## 6. Go live

- Re-create products/prices in the live Paddle account, repeat steps 2–3
  with **live** credentials, delete `VITE_PADDLE_ENV=sandbox` from env,
  redeploy, and do one live test purchase.