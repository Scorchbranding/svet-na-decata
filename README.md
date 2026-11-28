# Свет на децата

Static site and Vercel serverless functions for [svetnadecata.com](https://svetnadecata.com). Orders go to Stripe (card) or Alekston (cash on delivery). There is no database.

## PDF links

`652-kombinacii.pdf` stays in a private Vercel Blob. `api/download.js` streams it after one of:

- a paid Stripe session (`pdf` or `komplet`), unchanged
- a cash-on-delivery link `preuzmi.html?order=ID&t=TOKEN` after ELS marks the parcel delivered
- a private share link `/pdf/<token>` (rewritten to the same download handler)

The COD mailer is `api/cod-pdf-sync`. Its schedule is the `crons` entry for `/api/cod-pdf-sync` in `vercel.json` (currently `45 8 * * *`, 08:45 UTC, once a day for the Hobby plan). Change that string to reschedule. The lookback is 45 days and one run sends at most 40 mails (`LOOKBACK_DAYS` and `SEND_LIMIT` in `api/cod-pdf-sync.js`).

Unless `COD_PDF_AUTOSEND=1`, the cron is a dry-run: it sends nothing and returns the order ids and masked emails that would be mailed.

## Environment variables

Set these in Vercel, not in the repo.

| Name | Role |
| --- | --- |
| `PDF_LINK_SECRET` | HMAC key for COD download links (`cod:` + Alekston order id). Rotating it invalidates links already sent. |
| `PDF_SHARE_SECRET` | HMAC key for private share links. Rotating it kills every share link. |
| `PDF_ADMIN_SECRET` | Bearer password for `POST /api/pdf-link` and the form on `/pdf-link.html`. |
| `COD_PDF_AUTOSEND` | `1` sends the delivery mails. Any other value, including unset, is a dry-run. |

Related existing variables the new routes also use:

- `CRON_SECRET` — Bearer token for `/api/cod-pdf-sync` (Vercel Cron sends it when this is set)
- `PDF_SHARE_REVOKED` — comma-separated share-link ids to revoke without rotating `PDF_SHARE_SECRET`
- `ALEKSTON_API_TOKEN` / `ALEKSTON_API_URL` — list website orders (`orders:read`)
- `BLOB_READ_WRITE_TOKEN` — read the PDF and write the `cod-pdf/<orderId>.json` claim
- `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD` — SMTP. COD mail is From `radost@svetnadecata.com`

## Tests

```bash
npm test
```
