# media-map-web

A single-page Vite + React + TypeScript app that renders a "media map" — a
starfield of company "planets" sized by valuation, grouped into sectors, with
connection lines between related companies.

- Run the app: `npm run dev` (Vite dev server)
- Build: `npm run build`

## CMS (Sanity Studio)

The content management surface lives in [`studio/`](studio/) as a sibling
Sanity Studio v3 app. It's additive and developed independently — the React app
above does **not** yet read from it. See [`studio/README.md`](studio/README.md)
for setup, the data model, the one-time Google Sheet importer, and how to deploy
the Studio for the client.
