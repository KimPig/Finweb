import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function validateReleaseVersion(tag, metadata, lockfile) {
    assert.match(tag || '', /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, 'Use a stable tag such as v12.1.0');
    const version = tag.slice(1);
    assert.equal(metadata.name, 'finweb', 'Release must be built from Finweb');
    assert.equal(metadata.version, version, 'Tag and package.json version differ');
    assert.equal(metadata.finwebVersion, version, 'Tag and displayed Finweb version differ');
    assert.equal(metadata.jellyfinWebVersion, version.split('.').slice(0, 2).join('.'), 'Official Web prefix differs');
    assert.equal(lockfile.version, version, 'Lockfile version differs');
    assert.equal(lockfile.packages?.['']?.version, version, 'Lockfile root package version differs');
    assert.equal(lockfile.name, metadata.name, 'Lockfile package name differs');
    assert.equal(lockfile.packages?.['']?.name, metadata.name, 'Lockfile root package name differs');
    return version;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const metadata = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const lockfile = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
    const version = validateReleaseVersion(process.argv[2] || process.env.GITHUB_REF_NAME, metadata, lockfile);
    console.log(`Release version validated: ${version}`);
}
