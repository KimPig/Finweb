import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateReleaseVersion } from './validate-release.mjs';

const metadata = { name: 'finweb', version: '12.1.0', finwebVersion: '12.1.0', jellyfinWebVersion: '12.1' };
const lockfile = { name: 'finweb', version: '12.1.0', packages: { '': { name: 'finweb', version: '12.1.0' } } };

test('accepts a matching stable tag', () => {
    assert.equal(validateReleaseVersion('v12.1.0', metadata, lockfile), '12.1.0');
});

test('accepts Finweb-only revision increments', () => {
    const next = { ...metadata, version: '12.1.1', finwebVersion: '12.1.1' };
    const lock = { ...lockfile, version: '12.1.1', packages: { '': { name: 'finweb', version: '12.1.1' } } };
    assert.equal(validateReleaseVersion('v12.1.1', next, lock), '12.1.1');
});

test('rejects malformed tags, prereleases and shell-like input', () => {
    for (const tag of ['', undefined, '12.1.0', 'v12.1', 'v12.1.0-rc1', 'v012.1.0', 'v12.1.0;echo x']) {
        assert.throws(() => validateReleaseVersion(tag, metadata, lockfile));
    }
});

test('rejects mismatched identity, product version and Web prefix', () => {
    for (const [key, value] of [
        ['name', 'jellyfin-web'], ['version', '12.1.1'],
        ['finwebVersion', '12.1.1'], ['jellyfinWebVersion', '12.0']
    ]) {
        assert.throws(() => validateReleaseVersion('v12.1.0', { ...metadata, [key]: value }, lockfile));
    }
});

test('rejects a stale or missing root lockfile entry', () => {
    for (const lock of [
        { ...lockfile, version: '12.0.0' },
        { ...lockfile, name: 'jellyfin-web' },
        { ...lockfile, packages: {} },
        { ...lockfile, packages: { '': { name: 'finweb', version: '12.0.0' } } },
        { ...lockfile, packages: { '': { name: 'jellyfin-web', version: '12.1.0' } } }
    ]) {
        assert.throws(() => validateReleaseVersion('v12.1.0', metadata, lock));
    }
});
