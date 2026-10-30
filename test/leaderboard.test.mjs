import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { openLeaderboard, leaderboardRouter, MAX_RETAINED_SCORES } from '../server/leaderboard.mjs';

test('retention preserves the best 1,000 runs, boundary ties and the top 10 across restarts', () => {
    const directory = mkdtempSync(join(tmpdir(), 'neo-retention-'));
    const filename = join(directory, 'scores.sqlite');
    let store;
    let inspect;
    try {
        store = openLeaderboard(filename);
        inspect = new DatabaseSync(filename);
        for (let i = 0; i < MAX_RETAINED_SCORES; i++) {
            store.save({ player: `Runner ${i}`, score: 100, distance: 100 });
        }
        const initialTop = store.top();
        store.save({ player: 'Lower score', score: 99, distance: 1000 });
        store.save({ player: 'Shorter distance', score: 100, distance: 99 });
        store.save({ player: 'Later tie', score: 100, distance: 100 });
        assert.deepEqual(store.top(), initialTop);
        assert.equal(inspect.prepare('SELECT count(*) AS count FROM scores').get().count, MAX_RETAINED_SCORES);
        assert.equal(inspect.prepare("SELECT count(*) AS count FROM scores WHERE player IN ('Lower score', 'Shorter distance', 'Later tie')").get().count, 0);
        store.save({ player: 'Farther', score: 100, distance: 101 });
        store.save({ player: 'Higher score', score: 101, distance: 1 });
        assert.deepEqual(store.top().slice(0, 2).map(row => row.player), ['Higher score', 'Farther']);
        assert.equal(inspect.prepare("SELECT count(*) AS count FROM scores WHERE player IN ('Runner 998', 'Runner 999')").get().count, 0);
        const beforeRestart = store.top();
        store.close();
        store = openLeaderboard(filename);
        assert.deepEqual(store.top(), beforeRestart);
        assert.equal(inspect.prepare('SELECT count(*) AS count FROM scores').get().count, MAX_RETAINED_SCORES);
    } finally {
        inspect?.close();
        store?.close();
        rmSync(directory, { recursive: true, force: true });
    }
});

test('startup trims and compacts an oversized legacy database', () => {
    const directory = mkdtempSync(join(tmpdir(), 'neo-legacy-'));
    const filename = join(directory, 'scores.sqlite');
    let store;
    let inspect;
    try {
        store = openLeaderboard(filename);
        store.close();
        store = null;
        inspect = new DatabaseSync(filename);
        const insert = inspect.prepare('INSERT INTO scores (player, score, distance) VALUES (?, ?, ?)');
        inspect.exec('BEGIN');
        for (let i = 0; i < 3000; i++) insert.run(`Runner ${i}`, i, i);
        inspect.exec('COMMIT');
        const pagesBefore = inspect.prepare('PRAGMA page_count').get().page_count;
        const expected = inspect.prepare('SELECT player FROM scores ORDER BY score DESC, distance DESC, id ASC LIMIT 1000').all();
        const topTenBeforeCleanup = inspect.prepare('SELECT player, score, distance, date FROM scores ORDER BY score DESC, distance DESC, id ASC LIMIT 10').all();
        inspect.close();
        inspect = null;
        store = openLeaderboard(filename);
        inspect = new DatabaseSync(filename);
        assert.deepEqual(store.top(), topTenBeforeCleanup, 'Startup cleanup must preserve every top-10 record unchanged');
        assert.deepEqual(inspect.prepare('SELECT player FROM scores ORDER BY score DESC, distance DESC, id ASC').all(), expected);
        assert.ok(inspect.prepare('PRAGMA page_count').get().page_count < pagesBefore);
        assert.equal(inspect.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    } finally {
        inspect?.close();
        store?.close();
        rmSync(directory, { recursive: true, force: true });
    }
});

test('a failed prune rolls back the score submission', () => {
    const directory = mkdtempSync(join(tmpdir(), 'neo-rollback-'));
    let store;
    let inspect;
    try {
        const filename = join(directory, 'scores.sqlite');
        store = openLeaderboard(filename);
        inspect = new DatabaseSync(filename);
        const insert = inspect.prepare('INSERT INTO scores (player, score, distance) VALUES (?, ?, ?)');
        inspect.exec('BEGIN');
        for (let i = 0; i < MAX_RETAINED_SCORES; i++) insert.run('Existing', i, i);
        inspect.exec('COMMIT');
        inspect.exec("CREATE TRIGGER refuse_delete BEFORE DELETE ON scores BEGIN SELECT RAISE(ABORT, 'test failure'); END");
        assert.throws(() => store.save({ player: 'Failed run', score: 10000, distance: 1 }), /test failure/);
        assert.equal(inspect.prepare('SELECT count(*) AS count FROM scores').get().count, MAX_RETAINED_SCORES);
        assert.equal(inspect.prepare("SELECT count(*) AS count FROM scores WHERE player = 'Failed run'").get().count, 0);
        inspect.exec('DROP TRIGGER refuse_delete');
        store.save({ player: 'Successful run', score: 10000, distance: 1 });
        assert.equal(store.top()[0].player, 'Successful run');
    } finally {
        inspect?.close();
        store?.close();
        rmSync(directory, { recursive: true, force: true });
    }
});

test('scores persist across database reopen and rank by score, distance, then submission', () => {
    const directory = mkdtempSync(join(tmpdir(), 'neo-scores-'));
    let store;
    try {
        const filename = join(directory, 'scores.sqlite');
        store = openLeaderboard(filename);
        store.save({ player: "Neo'); DROP TABLE scores;--", score: 50, distance: 10 });
        store.save({ player: 'Farther', score: 50, distance: 20 });
        store.close();
        store = openLeaderboard(filename);
        assert.deepEqual(store.top().map(row => row.player), ['Farther', "Neo'); DROP TABLE scores;--"]);
        for (let score = 100; score < 112; score++) store.save({ player: 'Runner', score, distance: 1 });
        assert.equal(store.top().length, 10);
        assert.equal(store.top()[0].score, 111);
        assert.ok(Number.isFinite(Date.parse(store.top()[0].date)));
    } finally {
        store?.close();
        rmSync(directory, { recursive: true, force: true });
    }
});

test('API validates requests, shares scores, limits writes and returns JSON errors', async () => {
    const store = openLeaderboard(':memory:');
    const app = express();
    app.use('/api', leaderboardRouter(store));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}/api/leaderboard`;
    const post = (body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    try {
        assert.deepEqual(await (await fetch(url)).json(), []);
        for (const bad of [null, {}, { player: ' ', score: 0, distance: 0 },
            { player: 'A', score: -1, distance: 0 }, { player: 'A', score: '10', distance: 0 },
            { player: 'A'.repeat(41), score: 10, distance: 0 }, { player: 'A', score: 0.5, distance: 1 },
            { player: 'A', score: 1, distance: 1e10 }]) {
            assert.equal((await post(bad)).status, 400);
        }
        const saved = await post({ player: '  Neo  ', score: 123, distance: 456 });
        assert.equal(saved.status, 201);
        const rows = await saved.json();
        assert.equal(rows[0].player, 'Neo');
        const read = await fetch(url);
        assert.equal(read.headers.get('cache-control'), 'no-store');
        assert.equal(read.headers.get('x-content-type-options'), 'nosniff');
        assert.deepEqual(await read.json(), rows);
        const body = JSON.stringify({ player: 'Browser', score: 1, distance: 2 });
        for (const headers of [
            { Origin: 'https://unrelated.example' },
            { Origin: 'null' },
            { 'Sec-Fetch-Site': 'cross-site' }
        ]) {
            const rejected = await fetch(url, { method: 'POST', headers: {
                'Content-Type': 'application/json', ...headers
            }, body });
            assert.equal(rejected.status, 403);
        }
        const sameOrigin = await fetch(url, { method: 'POST', headers: {
            'Content-Type': 'application/json', Origin: new URL(url).origin
        }, body });
        assert.equal(sameOrigin.status, 201);
        const compressed = await fetch(url, { method: 'POST', headers: {
            'Content-Type': 'application/json', 'Content-Encoding': 'gzip'
        }, body });
        assert.equal(compressed.status, 415);
        assert.equal((await fetch(url, { method: 'POST', body: 'text' })).status, 415);
        assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
        assert.equal((await post({ player: 'x'.repeat(3000), score: 0, distance: 0 })).status, 413);
        assert.equal((await fetch(`${url}/missing`)).status, 404);
        let status;
        for (let i = 0; i < 21; i++) status = (await post({ player: 'A', score: 1, distance: 1 })).status;
        assert.equal(status, 429);
        for (let i = 0; i < 121; i++) status = (await fetch(url)).status;
        assert.equal(status, 429);
    } finally {
        await new Promise(resolve => server.close(resolve));
        store.close();
    }
});
