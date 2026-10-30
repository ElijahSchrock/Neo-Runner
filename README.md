# Neo Runner

A Three.js endless runner. The game runs in the browser, with a small Node/SQLite leaderboard API.

## Run locally

Use Node.js 24 or newer (`.nvmrc` selects 24). If you use nvm:

```sh
nvm install
nvm use
```

Install dependencies and start the game:

```sh
npm ci
npm start
```

Open the URL printed in the terminal (normally http://127.0.0.1:5173).
`npm run dev` also starts the development server. Leave the terminal running;
press Ctrl+C to stop it. A browser with WebGL enabled is required.

The model is about 94 MB, so the initial load can take a moment.
Enter a name and press Start. Use left/right arrows to move, up to pause,
and down to resume. Touch controls are provided on mobile.

## Assets

All five required files are included in `public/assets/`. No cloud account or
credentials are needed locally.

To load assets from DigitalOcean Spaces instead, copy `.env.example` to
`.env.local` and set `VITE_ASSET_BASE_URL` to the public directory URL containing
`Neo.glb`, `background-music.mp3`, `obst-hit-option2.wav`, `bonus-7.wav`, and
`health-bonus.wav`. Restart Vite after editing the environment file; rebuild
for production. The bucket must allow public reads and cross-origin requests
from the game origin. Vite variables are public browser configuration: never
put Spaces access keys or secrets in them.

## Scores

Scores are shared between browsers through `/api/leaderboard` and stored in
SQLite at `data/neo-runner.sqlite`. The database and schema are created on first
start. No database installation, account, or credentials are needed. The top 10
runs are ranked by score, then distance. Player names are limited to 40 characters.
The browser reports submission failures without stopping the game.

The old Heroku service and browser-only score storage are no longer used.
Existing browser-local scores aren't imported. Scores are client-submitted;
this casual leaderboard does not verify runs or authenticate player names.

Optional server settings in `.env.local` (or process environment):

- `DATABASE_PATH`: persistent SQLite file path (default `data/neo-runner.sqlite`).
- `PORT`: default 5173 in development, 3000 in production.
- `HOST`: defaults to `127.0.0.1`.

Keep the database and its WAL/SHM files out of git. For deployment, put it outside
the checkout on persistent storage and back it up using SQLite's backup tools.

## Production

```sh
npm run build
npm run serve
```

Open http://127.0.0.1:3000. This serves the built game and API together. The
leaderboard requires the Node process; static hosting alone is insufficient.
`npm run preview` only previews the frontend and does not serve the API.

For the DigitalOcean server, see [the Forge deployment guide](deploy/forge.md)
for `neorunner.elijahschrock.com`, persistent database storage, Nginx, and HTTPS.
Nothing is deployed by running the local commands above.

## Checks

```sh
npm test
npm run build
```

Tests cover database persistence and ranking, parameterized SQL, API validation,
request limits, and error responses. The backend uses Node's built-in
[`node:sqlite`](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html)
module, which Node 24 documents as a release candidate API.
