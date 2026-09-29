# Security updates and deployment

The database hardening migration is applied to Supabase project `pzlcxctnnhjqpbhwcxqx`.
The frontend source and Apps Script gateway have additional updates that must be deployed together.

## Google Apps Script

1. Open the Apps Script project currently used by `VITE_GAS_URL`.
2. Replace its `Code.gs` with [`google-apps-script/Code.gs`](google-apps-script/Code.gs).
3. In **Project Settings → Script properties**, make sure these properties are present:
   - `SUPABASE_URL`: the Supabase project URL.
   - `SUPABASE_KEY`: the Supabase publishable/anon key. Never use a service role key here.
   - `SLIPOK_API_KEY`: a newly rotated SlipOK key.
   - `SLIPOK_BRANCH_ID`: the SlipOK branch ID.
4. Deploy a new version of the web app. Keep the existing endpoint URL and web-app access set to `Anyone`. Management actions are checked against the caller's Supabase access token and department permissions. The public website uses only `read_public_documents` and `search_public_certificates`, which return limited public fields without a token.

## Vercel

1. Keep `VITE_GAS_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_ONESIGNAL_APP_ID` set for the project.
2. Delete `VITE_SLIPOK_API_KEY` and `VITE_SLIPOK_BRANCH_ID` from all Vercel environments. They must not be build-time variables.
3. Deploy the current source to Vercel after updating Apps Script. The new frontend sends the signed-in Supabase access token to Apps Script.
4. The public `index.html` also reads `VITE_GAS_URL`; if a new Apps Script deployment created a different `/exec` URL, update that variable in Vercel and the local `.env` before deploying.

After both deployments, open the public document library and confirm its project, meeting, and template counts are populated. Search for a known certificate using its five-digit student ID. Run `npm run test:gas` locally to check the public endpoint's limited output and that private sheet actions still reject anonymous requests.

## Supabase Auth dashboard

Enable **Leaked password protection** under Authentication password/security settings. Supabase's advisor currently reports this setting as disabled; it is controlled in the dashboard rather than by this repository migration.

## Notes

- Fresh SlipOK credentials are required because the former key was previously included in browser build configuration.
- New fine-payment slips are saved without public link sharing. Existing Drive files keep their prior sharing settings and need a deliberate review. Attendance and duty photos remain link-readable because the current portal displays them through Drive thumbnails.
- Apps Script `doPost` returns JSON errors with HTTP 200 by platform convention; clients must check the JSON `success` property.
