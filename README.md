# Own Pace

Own Pace is a private running log that brings your Strava stats and kilometre splits into one place.

- Sign in with Strava and sync your runs in batches. Press **Sync runs** again if more activities are available.
- See the last 12 weeks of running distance, all-time totals, longest run, and this month versus last month.
- Browse and filter your runs by name, date, distance, and pace. Open a run to see its route and kilometre splits. Routes are fetched from Strava on each visit; splits are saved after the first visit. Map tiles are loaded from OpenStreetMap, which can see the area displayed.
- Review monthly distance, pace, and heart-rate trends across the last 12 calendar months.
- Calculate personal records from Strava's best efforts, or consecutive complete splits that exactly match a milestone, without estimating partial segments. The page has all-time, last 12 months, last 90 days, and year-to-date tabs; periods use UTC and run dates use your device's local timezone. It compares records with the fastest earlier effort and checks five runs per batch, preferring moving time and falling back to elapsed time; missing records are reported separately.
- Delete your Own Pace account and imported data in **Settings**. This does not delete anything on Strava.

Built with Next.js App Router, TypeScript, Auth.js v5, Prisma, Neon Postgres, Tailwind CSS, shadcn/ui components, and Recharts.

## Local setup

1. Install Node.js 22 (22.12 or newer), then clone and install:

   ```sh
   git clone https://github.com/DiegoRojo99/Own-Pace.git
   cd Own-Pace
   npm ci
   cp .env.example .env
   ```

2. Create a [Neon](https://neon.tech/) database. Set `DATABASE_URL` to its **pooled** connection string and `DIRECT_URL` to its **direct** connection string. Prisma CLI commands read `.env`; keep the migration URL there for local development.
3. Generate an Auth.js secret (`openssl rand -base64 32`) for `AUTH_SECRET`. Create an app at [strava.com/settings/api](https://www.strava.com/settings/api) and set `AUTH_STRAVA_ID` and `AUTH_STRAVA_SECRET` from its client ID and secret. Set its Authorization Callback Domain to `localhost` (host only). The local callback is `http://localhost:3000/api/auth/callback/strava`.
4. Apply the migration and start the app:

   ```sh
   npx prisma migrate deploy
   npm run dev
   ```

5. Open [localhost:3000](http://localhost:3000), authorize Strava activity access, and sync. Check your Strava API app's athlete capacity before inviting friends: new apps may be restricted to the owner until Strava approves more athletes.

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` to run the same checks as CI. These checks do not need Strava credentials or a database connection.

## Deploy on Vercel

1. Import the repository as a Next.js project and select Node.js 22.x.
2. Configure all five variables from `.env.example` in the Production environment. Use a separate database and OAuth app for previews if you want to test sign-in there.
3. Run `npx prisma migrate deploy` with the production `DIRECT_URL` from a trusted environment before serving traffic. The build generates the Prisma client but does not apply schema changes.
4. Set the Strava Authorization Callback Domain to your stable production hostname (no scheme or path). Its callback URL is `https://YOUR_HOST/api/auth/callback/strava`. Verify the consent screen includes activity access and that a returning athlete can reconnect.

OAuth access tokens are used only on the server. Incremental sync imports newer activities; it is not a two-way mirror and does not apply older Strava edits or deletions. The shared Strava quota depends on the limits assigned to your API app.

## Roadmap

- Strava webhooks for deauthorization and automatic sync
- Training load
- Route heatmap
- Pace versus heart-rate trend
- Shoe mileage tracking

MIT licensed.