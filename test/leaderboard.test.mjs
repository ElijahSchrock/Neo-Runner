import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { openLeaderboard, leaderboardRouter } from '../server/leaderboard.mjs';

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
        assert.deepEqual(await read.json(), rows);
        assert.equal((await fetch(url, { method: 'POST', body: 'text' })).status, 415);
        assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
        assert.equal((await post({ player: 'x'.repeat(3000), score: 0, distance: 0 })).status, 413);
        assert.equal((await fetch(`${url}/missing`)).status, 404);
        let status;
        for (let i = 0; i < 21; i++) status = (await post({ player: 'A', score: 1, distance: 1 })).status;
        assert.equal(status, 429);
    } finally {
        await new Promise(resolve => server.close(resolve));
        store.close();
    }
});
