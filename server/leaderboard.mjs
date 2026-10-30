import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import express from 'express';
import { rateLimit } from 'express-rate-limit';

export const MAX_RETAINED_SCORES = 1000;
const RANKING = 'score DESC, distance DESC, id ASC';

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
    const top = db.prepare(`SELECT player, score, distance, date FROM scores ORDER BY ${RANKING} LIMIT 10`);
    // Only ranks 1,001 onward are eligible for deletion; the top 10 are always kept.
    // If fewer than 1,001 runs exist, this selects nothing and deletes nothing.
    const prune = db.prepare(`DELETE FROM scores WHERE id IN (
        SELECT id FROM scores ORDER BY ${RANKING} LIMIT -1 OFFSET ?
    )`);
    // Clean up older installations once, including reclaiming their unused pages.
    const removed = prune.run(MAX_RETAINED_SCORES).changes;
    if (removed > 0) db.exec('VACUUM');

    return {
        top: () => top.all(),
        save: ({ player, score, distance }) => {
            // Readers see either the previous pool or the fully pruned new pool.
            db.exec('BEGIN IMMEDIATE');
            try {
                insert.run(player, score, distance);
                prune.run(MAX_RETAINED_SCORES);
                db.exec('COMMIT');
            } catch (error) {
                db.exec('ROLLBACK');
                throw error;
            }
        },
        close: () => db.close()
    };
}

export function leaderboardRouter(store) {
    const router = express.Router();
    router.use((_req, res, next) => {
        res.set('Cache-Control', 'no-store');
        res.set('X-Content-Type-Options', 'nosniff');
        next();
    });
    router.use(rateLimit({
        windowMs: 60_000,
        limit: 120,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        message: { error: 'Too many API requests. Please try again in a minute.' }
    }));
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
        // Browser requests must originate from this app. This is not authentication:
        // scripts outside the browser can still submit scores directly.
        if (req.get('Sec-Fetch-Site') === 'cross-site') {
            return res.status(403).json({ error: 'Cross-site score submissions are not allowed.' });
        }
        const origin = req.get('Origin');
        if (origin) {
            try {
                if (new URL(origin).host !== req.get('Host')) {
                    return res.status(403).json({ error: 'Cross-origin score submissions are not allowed.' });
                }
            } catch {
                return res.status(403).json({ error: 'Invalid request origin.' });
            }
        }
        if (!req.is('application/json')) return res.status(415).json({ error: 'Send application/json.' });
        next();
    }, express.json({ limit: '2kb', inflate: false }), (req, res) => {
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
        const status = [400, 413, 415].includes(error.status) ? error.status : 500;
        if (status === 500) console.error(error);
        res.status(status).json({ error: status === 500 ? 'Leaderboard unavailable.'
            : status === 415 ? 'Unsupported encoding. Send uncompressed UTF-8 JSON.'
            : 'Invalid or oversized JSON body.' });
    });
    return router;
}
