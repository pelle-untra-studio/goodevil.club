# relational-shape

The Relational Shape Model probe by Anna Gee Gyllenklev → `relational-shape.goodevil.club`.

Single-file static app (no build step). `index.html` is currently a branded
**placeholder** ("coming soon"). Drop in the real experience by replacing
`index.html` with the final piece.

## Deploy (Vercel)

This repo only holds the app code. The subdomain itself is wired up in the
Vercel dashboard, same pattern as the other probes:

1. Create a new Vercel project pointing at this directory (`apps/relational-shape`).
2. No build command needed — it serves `index.html` directly.
3. Add the custom domain `relational-shape.goodevil.club` to the project.
