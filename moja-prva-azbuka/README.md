# Мојата прва азбука (recovered landing)

Source of truth for the **three-offer** landing that must be served at `/azbuka` on the Vercel project `moja-prva-azbuka` (rewritten from `https://svetnadecata.com/azbuka`).

## Offers

| Offer | Price | Checkout |
| --- | --- | --- |
| PDF | 490 MKD | Stripe via `POST /azbuka/api/checkout` |
| Printed | 999 MKD | Cash on delivery via `https://svetnadecata.com/api/azbuka-order` |
| Bundle (printed + PDF) | 1.199 MKD | Same COD endpoint |

Meta pixel `940198738676816`: PageView + ViewContent on load; InitiateCheckout on buy/COD click; Purchase on COD success (and on Stripe thank-you flow).

## Routing (required)

`vercel.json` must rewrite `/azbuka` → `/index.html` and `/azbuka/:path*` → `/:path*`, and redirect `/azbuka/` → `/azbuka`. Without these rewrites, `svetnadecata.com/azbuka` returns **404**.

**Note (svet-na-decata):** Production now serves the public landing from this monorepo at `/azbuka/*` and only proxies `/azbuka/api/*` to the `moja-prva-azbuka` Vercel project. Keep this folder in sync when editing the standalone project.

## Incident (2026-10-16)

Connecting GitHub repo `Scorchbranding/moja-prva-azbuka` and deploying commit “Verify Git auto-deploy” replaced production with an older **root-only PDF** page (no `/azbuka` rewrite, no 999/1.199 COD). Production was rolled back to deployment `dpl_GXFbX81FEb2VyFLEbXKqXgoBJW9U` (2026-10-13).

## Restore this tree to the Vercel project

This folder has the **public landing** recovered from that good deployment. Server API (`api/*`), `lib/*`, and `private/*.pdf` still live only on that Vercel deployment — copy them from the deployment source (or an admin with access to `Scorchbranding/moja-prva-azbuka`) before linking Git auto-deploy again.

1. Overwrite `Scorchbranding/moja-prva-azbuka` (or point the Vercel project here) with this tree **plus** the missing `api/`, `lib/`, and `private/` from the good deployment.
2. Confirm `vercel.json` still contains the `/azbuka` rewrites.
3. Deploy to production and verify `https://svetnadecata.com/azbuka` is 200 with all three offers.
