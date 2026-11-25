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

Explorer divides the world into standard Web Mercator slippy-map tiles at zoom 17 (about 235 m across at 40° latitude; size varies with latitude). It traces each segment of Strava's stored precision-5 summary polyline through the tile grid: these summaries are simplified, so looking only at their points would miss tiles between them. Runs, trail runs, and walks with no GPS summary (including manual or treadmill activities) are skipped.

Sync processes pending activities after saving them. On the Explorer page, **Process my activities** continues the oldest pending activities in bounded batches; press it again while any remain. Sync's existing history scan fills in older route summaries without extra Strava requests. **Recalculate tiles** clears your tiles and starts a fresh, resumable rebuild, including after a change to the tile zoom. If a previously processed summary changes during sync, tiles are cleared and rebuilt from the stored summaries. First visits and monthly counts use activity start dates; months use UTC. When older activities arrive later, their earlier visits can change attribution and historical counts.

The migration to zoom 17 clears the old derived tiles and makes previously processed activities pending again. After deploying it, sync or use **Process my activities** to rebuild the smaller tiles from stored routes; no extra Strava requests are needed. Counts will be incomplete until processing finishes.

Malformed summaries are skipped and logged. An unusually large route that crosses more than one million tile boundaries fails processing explicitly instead of blocking the server; it remains pending for investigation.

### City lookup

On Explorer, search for a city and country and choose an administrative boundary to add it to your private city list. Searches are explicitly submitted, never autocomplete. The search text is sent to OpenStreetMap's Nominatim service; do not enter personal information. Your activity routes are not sent. Search results and unavailable boundary lookups are cached for 30 days using hashed keys; selected public boundaries are cached in the database. Previously cached cities were not saved to a personal list, so select them again to track them.

The public Nominatim service has a [usage policy](https://operations.osmfoundation.org/policies/nominatim/): one request per second across the whole application, no autocomplete or systematic queries, identification, caching, and OpenStreetMap attribution. A shared database lease limits requests across server instances; a failed or crashed request can temporarily delay another lookup. OpenStreetMap data is available under the [ODbL](https://www.openstreetmap.org/copyright). To switch to another compatible service without changing code, set `CITY_NOMINATIM_URL` to its HTTPS base URL in the server environment.

Only administrative OSM ways or relations with usable Polygon or MultiPolygon geometry are accepted; some cities may not have a suitable search result. Boundaries are not automatically refreshed yet. City tile centers must be strictly inside the boundary; polygon holes and disjoint areas are respected. A tile must also contain a positive-length section of an OSM public walking route inside the city. The network includes residential streets, footways, pedestrian streets, paths, tracks, living streets, cycleways, steps, and ordinary roads. Motorways, trunks, motorroads, private/military/no-access ways, non-public access, and conditional pedestrian access are excluded.

The server queries [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) for public highways and military, private/no-access, and water polygons. It clips highway sections against those polygons, including multipolygon holes. A mixed tile remains eligible when an accessible section exists outside restricted land. Water crossings count only on explicitly tagged bridges carrying an allowed highway; bridges never override military/private exclusions. This is an estimate based on OSM tags, not a guarantee of legal access, safety, or achievable 100% completion. Missing tags, closures, and mapping errors can still affect results; follow local access signs.

Only public city bounds are sent to Overpass, never activity routes or user identifiers. The derived walking-network mask is cached with the shared city, with a separate application-wide request lease. Timeouts, truncated/malformed responses, and provider limits stop preparation explicitly rather than falling back to unfiltered tiles. Set `CITY_OVERPASS_URL` to an HTTPS interpreter endpoint to use another compatible provider. Masks are refreshed when an admin saves the city boundary, not automatically. The runnable-tile migration discards old city catalogs so they rebuild on the next Explorer visit; private activity claims are unchanged. City progress is your claimed eligible city tiles divided by all eligible city tiles; it can increase while activities are still pending.

Overpass queries request a 20-second execution limit and 128 MiB of server-side memory, rather than the usual 512 MiB default memory allowance. The HTTP deadline is separately set to 25 seconds, and downloaded responses are limited to 32 MiB; `[maxsize]` limits query memory, not response bytes. Smaller resource requests can improve admission but cannot guarantee availability on an overloaded server.

To select a public mirror, set one of these full interpreter URLs in the server environment and restart/redeploy:

```env
CITY_OVERPASS_URL=https://overpass.private.coffee/api/interpreter
```

Alternatively, use `https://maps.mail.ru/osm/tools/overpass/api/interpreter`. These are the endpoints listed on the [OSM Overpass API wiki](https://wiki.openstreetmap.org/wiki/Overpass_API), not the providers' homepages. Without an override, the app uses `https://overpass-api.de/api/interpreter`; it does not automatically switch providers. Mirror availability and usage policies can change.

Preparing a city runs in resumable batches while Explorer is open. Other users selecting the same city reuse its public tile catalog. A percentage appears only after preparation finishes; it resumes if you leave and return. Private activity claims remain in `UserTile` and match city tiles by `(zoom, x, y)`, filtered by the signed-in user. Removing a city does not delete your claims; deleting your account removes your private city selections and claims.

When several cities need preparing, cards automatically wait for the application's shared Overpass request slot. Provider rate limits, timeouts, and temporary capacity errors trigger up to three automatic retries with increasing delays, respecting `Retry-After`; the cards show the wait rather than stopping immediately. Failed provider requests also impose a shared cooldown so other cities cannot immediately repeat them. Persistent failures expose **Try again**. Public Overpass servers are best-effort services: for reliable regular use, configure `CITY_OVERPASS_URL` with a suitable dedicated or self-hosted provider. Failed requests never produce an unfiltered catalog.

The shared-slot message means another request is active and includes the next check time. If the provider is unavailable or rate-limits a request, all waiting cities show the provider error and retry delay instead; their retries are bounded, even when another city encountered the failure.

After applying the runnable-tile migration, restart the development server or deploy the updated application, then reload Explorer and leave it open to rebuild. Catalogs without a cached walking-network mask are treated as pending even if an older application marked them ready. You do not need to remove and re-add cities; doing so only changes your private selections, not the shared catalog.

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
### Admin: city boundaries

Set `ADMIN_STRAVA_ATHLETE_IDS` (comma-separated Strava athlete IDs) in the server environment, then open `/admin/cities` to edit a city's GeoJSON Polygon or MultiPolygon boundary. Saving discards the city's tiles; they are rebuilt for all users tracking it the next time Explorer prepares the city. Other users get a 404 on these pages.
