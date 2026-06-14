# Alsaleh World Cup Tournament 2026 — New GitHub Repo Leaderboard

This package is ready for a **new GitHub repository** and connects a GitHub Pages leaderboard to Google Sheets.

## Files

- `index.html` — redirects visitors to the leaderboard.
- `leaderboard.html` — responsive public leaderboard page.
- `scores.js` — loads and renders Google Sheets data.
- `Code.gs` — Google Apps Script API for your Google Sheet.
- `.nojekyll` — keeps GitHub Pages simple.

## Features

- 🏆 Live ranking table
- 🥇 Gold/Silver/Bronze top 3 cards
- 📈 Rank movement using browser local storage
- 👨‍👩‍👧‍👦 Family leaderboard
- ⚽ Match-by-match points modal
- 📱 Mobile responsive design
- 🇰🇼 Alsaleh World Cup Tournament branding
- JSONP support to avoid browser CORS problems with Google Apps Script

## Step 1 — Create the new GitHub repository

1. Go to GitHub.
2. Create a new public repository, for example:

   `AlSalehWorldCupLeaderboard`

3. Upload these files to the repository root:

   - `index.html`
   - `leaderboard.html`
   - `scores.js`
   - `.nojekyll`

4. Go to **Settings → Pages**.
5. Under **Build and deployment**, choose:

   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/root`

6. Save.

Your public site will look like:

`https://YOUR_USERNAME.github.io/AlSalehWorldCupLeaderboard/`

## Step 2 — Convert your Excel file to Google Sheets

1. Upload your Excel file to Google Drive.
2. Open it with Google Sheets.
3. Confirm each participant has a separate sheet.
4. The first row should include headers like:

   - `Teams` or `Match`
   - `hp` for home prediction
   - `ap` for away prediction
   - `hr` for home result
   - `ar` for away result

The Apps Script also supports Arabic-style headers, but `Teams`, `hp`, `ap`, `hr`, and `ar` are safest.

## Step 3 — Add the Google Apps Script

1. In the Google Sheet, go to **Extensions → Apps Script**.
2. Delete any existing code.
3. Paste everything from `Code.gs`.
4. Save the project.
5. Click **Deploy → New deployment**.
6. Select **Web app**.
7. Use these settings:

   - Execute as: `Me`
   - Who has access: `Anyone`

8. Click **Deploy**.
9. Copy the Web App URL ending in `/exec`.

## Step 4 — Connect GitHub to Google Sheets

Open `scores.js` and replace this line:

```js
APPS_SCRIPT_URL: "PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE",
```

with your real Apps Script URL:

```js
APPS_SCRIPT_URL: "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec",
```

Commit and upload the updated `scores.js` to GitHub.

## Step 5 — Update scores during the tournament

Update the actual match scores in Google Sheets columns:

- `hr` = home result
- `ar` = away result

The leaderboard will refresh automatically every 60 seconds.

## Optional — Use one master scores sheet

Create a sheet named `Match Scores` with columns:

- `Teams`
- `hr`
- `ar`

When this sheet exists, the script uses it as the master source for actual scores across all participant sheets.

## Scoring rules

Default scoring is in `Code.gs`:

```js
POINTS: {
  correctResult: 48,
  exactHome: 15,
  exactAway: 15,
  exactGoalDiff: 12
}
```

Change those values if your rules change.

## Family leaderboard

The system detects families from names:

- Alsaleh / الصالح / صالح
- Abdulhadi / عبد الهادي / عبدالهادي

For manual control, create a sheet called `Participants` with columns:

- `Name`
- `Family`

## Troubleshooting

If you see demo data, the Apps Script URL is not connected yet.

If the page says setup needed:

1. Check the Web App access is `Anyone`.
2. Make sure the URL ends with `/exec`, not `/dev`.
3. Redeploy the script after any change in Apps Script.
4. Refresh the GitHub Pages site.
