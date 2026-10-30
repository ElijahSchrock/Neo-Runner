import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { openLeaderboard, leaderboardRouter } from './server/leaderboard.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const dev = process.argv.includes('--dev');
const port = Number(process.env.PORT || (dev ? 5173 : 3000));
const host = process.env.HOST || '127.0.0.1';
const databasePath = resolve(process.env.DATABASE_PATH || resolve(root, 'data/neo-runner.sqlite'));
const app = express();
app.disable('x-powered-by');
// Only a local reverse proxy (such as Forge's Nginx) may forward client IPs.
app.set('trust proxy', 'loopback');
const store = openLeaderboard(databasePath);
app.use('/api', leaderboardRouter(store));
const server = createServer(app);
let vite;

if (dev) {
    const { createServer: createViteServer } = await import('vite');
    vite = await createViteServer({
        root,
        server: {
            middlewareMode: true,
            hmr: { server },
            fs: { deny: ['.env', '.env.*', '**/*.{crt,pem}', '**/.git/**', '**/data/**', '**/*.sqlite*', databasePath, `${databasePath}-*`] }
        }
    });
    app.use(vite.middlewares);
} else {
    if (!existsSync(resolve(root, 'dist/index.html'))) {
        store.close();
        throw new Error('Build the game first with npm run build.');
    }
    app.use(express.static(resolve(root, 'dist')));
}

server.requestTimeout = 15_000;
server.on('error', (error) => {
    console.error(error);
    process.exit(1);
});
server.listen(port, host, () => console.log(`Neo Runner: http://${host}:${port} (${dev ? 'development' : 'production'})`));

async function shutdown() {
    server.close(async () => {
        await vite?.close();
        store.close();
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
