# Own Pace

Own Pace is a private running log that brings your Strava stats and kilometre splits into one place.

- Sign in with Strava and sync runs and walks in batches. Press **Sync Strava activities** again if there are more activities to check.
- Browse your walk history and see your five longest imported walks on the **Walks** page. Older walks are picked up as sync rotates through your activity history.
- View imported runs and walks with GPS routes together on the full-width **Map** page. Older routes appear as you sync through your history. The OpenStreetMap street layer is off by default; enabling it shares the visible area with OpenStreetMap.
- Explore your own routes on **Explorer** and turn on **Explorer tiles** on the map. Explorer data is derived only from your own imported activities and is deleted with your account.
- See the last 12 weeks of running distance, all-time totals, longest run, and this month versus last month.
- Browse and filter your runs by name, date, distance, and pace. Open a run to see its route and kilometre splits. Routes are fetched from Strava on each visit; splits are saved after the first visit. Map tiles are loaded from OpenStreetMap, which can see the area displayed.
- Review monthly distance, pace, and heart-rate trends across the last 12 calendar months.
- In **Trends → Running & walking**, press **Analyze next 5 runs** to process imported runs in resumable batches. View stacked running/walking minutes per activity and the first/last sustained running bouts over time, plus a per-activity duration table. Running starts at **135 total steps/minute** (Strava run cadence is doubled); lower moving cadence, including zero, counts as walking. When cadence is absent, use Strava's smoothed speed, or speed derived from distance/time if needed: **9:00/km or faster** counts as running. These results are labeled **Speed estimate** in the table and tooltips; speed cannot reliably distinguish brisk walking from slow running. Bouts bridge walking/stopped interruptions of **up to 15 seconds** and require **at least 30 running seconds**. Bridged walking/stopped seconds are excluded from running durations, and this bout tolerance does not change running/walking totals. First/last bouts ignore walking warm-ups/cool-downs and short running bursts; a single qualifying bout is used for both, and no qualifying bouts is shown as zero. Durations use sampled intervals, not Strava's reported moving time. Runs without usable time/moving and cadence or speed/distance streams remain unavailable, leave gaps in the lines, and can be retried. Dates use UTC; summaries are cached independently of activity sync. Outdated calculations automatically become pending and stay hidden until reanalyzed.
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

## Explorer tiles

Explorer divides the world into standard Web Mercator slippy-map tiles at zoom 14. It traces each segment of Strava's stored precision-5 summary polyline through the tile grid: these summaries are simplified, so looking only at their points would miss tiles between them. Runs, trail runs, and walks with no GPS summary (including manual or treadmill activities) are skipped.

Sync processes pending activities after saving them. On the Explorer page, **Process my activities** continues the oldest pending activities in bounded batches; press it again while any remain. Sync's existing history scan fills in older route summaries without extra Strava requests. **Recalculate tiles** clears your tiles and starts a fresh, resumable rebuild, including after a change to the tile zoom. If a previously processed summary changes during sync, tiles are cleared and rebuilt from the stored summaries. First visits and monthly counts use activity start dates; months use UTC. When older activities arrive later, their earlier visits can change attribution and historical counts.

Malformed summaries are skipped and logged. An unusually large route that crosses more than one million tile boundaries fails processing explicitly instead of blocking the server; it remains pending for investigation.

## Deploy on Vercel

1. Import the repository as a Next.js project and select Node.js 22.x.
2. Configure all five variables from `.env.example` in the Production environment. Use a separate database and OAuth app for previews if you want to test sign-in there.
3. Run `npx prisma migrate deploy` with the production `DIRECT_URL` from a trusted environment before serving traffic. The build generates the Prisma client but does not apply schema changes.
4. Set the Strava Authorization Callback Domain to your stable production hostname (no scheme or path). Its callback URL is `https://YOUR_HOST/api/auth/callback/strava`. Verify the consent screen includes activity access and that a returning athlete can reconnect.

OAuth access tokens are used only on the server. Incremental sync imports newer runs and walks. It also scans one page per sync as it cycles through activity history, refreshing names and GPS route summaries and importing previously skipped walks. It does not apply other older Strava edits or deletions. The shared Strava quota depends on the limits assigned to your API app.

## Roadmap

- Strava webhooks for deauthorization and automatic sync
- Training load
- Route heatmap
- Pace versus heart-rate trend
- Shoe mileage tracking
- Fog of war, neighbourhood completion, and XP/badges

MIT licensed.