import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import express from 'express';
import { rateLimit } from 'express-rate-limit';

export function openLeaderboard(filename) {
    if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
    const db = new DatabaseSync(filename);
    db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA busy_timeout = 5000;
        CREATE TABLE IF NOT EXISTS scores (
            id INTEGER PRIMARY KEY,
            player TEXT NOT NULL CHECK(length(player) BETWEEN 1 AND 40),
            score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 1000000000),
            distance INTEGER NOT NULL CHECK(distance BETWEEN 0 AND 1000000000),
            date TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE INDEX IF NOT EXISTS scores_ranking ON scores(score DESC, distance DESC, id ASC);
    `);
    const insert = db.prepare('INSERT INTO scores (player, score, distance) VALUES (?, ?, ?)');
    const top = db.prepare('SELECT player, score, distance, date FROM scores ORDER BY score DESC, distance DESC, id ASC LIMIT 10');
    return {
        top: () => top.all(),
        save: ({ player, score, distance }) => insert.run(player, score, distance),
        close: () => db.close()
    };
}

export function leaderboardRouter(store) {
    const router = express.Router();
    router.use((_req, res, next) => {
        res.set('Cache-Control', 'no-store');
        next();
    });
    router.get('/health', (_req, res) => {
        store.top();
        res.json({ status: 'ok' });
    });
    router.get('/leaderboard', (_req, res) => res.json(store.top()));
    router.post('/leaderboard', rateLimit({
        windowMs: 60_000,
        limit: 20,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        message: { error: 'Too many score submissions. Please try again in a minute.' }
    }), (req, res, next) => {
        if (!req.is('application/json')) return res.status(415).json({ error: 'Send application/json.' });
        next();
    }, express.json({ limit: '2kb' }), (req, res) => {
        const { player, score, distance } = req.body || {};
        if (typeof player !== 'string' || !player.trim() || player.trim().length > 40
            || /[\u0000-\u001f\u007f]/u.test(player)
            || !Number.isInteger(score) || score < 0 || score > 1_000_000_000
            || !Number.isInteger(distance) || distance < 0 || distance > 1_000_000_000) {
            return res.status(400).json({ error: 'Use a name of 1–40 characters and nonnegative integer scores and distances up to 1 billion.' });
        }
        store.save({ player: player.trim(), score, distance });
        res.status(201).json(store.top());
    });
    router.use((_req, res) => res.status(404).json({ error: 'API route not found.' }));
    router.use((error, _req, res, _next) => {
        const status = error.status === 413 ? 413 : error.status === 400 ? 400 : 500;
        if (status === 500) console.error(error);
        res.status(status).json({ error: status === 500 ? 'Leaderboard unavailable.' : 'Invalid or oversized JSON body.' });
    });
    return router;
}
