/* eslint-disable compat/compat -- Developer checks run in Node 24. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const metadata = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const source = ts.createSourceFile('apphost.js',
    await readFile(new URL('src/components/apphost.js', root), 'utf8'), ts.ScriptTarget.Latest, true);
const declarations = source.statements.filter(ts.isVariableStatement)
    .flatMap(statement => statement.declarationList.declarations);
const appName = declarations.find(node => node.name.getText(source) === 'appName').initializer.text;
const host = declarations.find(node => node.name.getText(source) === 'appHost').initializer;

function identity(window) {
    return Object.fromEntries(['appName', 'appVersion'].map(name => {
        const method = host.properties.find(node => node.name?.getText(source) === name);
        assert.ok(method);
        // eslint-disable-next-line sonarjs/code-eval -- Only evaluate these two declarations from the trusted checkout.
        const invoke = new Function('window', 'appName', '__FINWEB_VERSION__',
            `return (${method.initializer.getText(source)})();`);
        // eslint-disable-next-line sonarjs/code-eval -- Invoke only the two trusted methods extracted above with fixture globals.
        return [name, invoke(window, appName, metadata.finwebVersion)];
    }));
}

assert.equal(metadata.version, '12.1.0');
assert.equal(metadata.jellyfinWebVersion, '12.1');
assert.equal(metadata.finwebVersion, '12.1.0');
for (const window of [{}, { NativeShell:{} }, { NativeShell:{ AppHost:{} } }]) {
    assert.deepEqual(identity(window), { appName:'Finweb', appVersion:'12.1.0' });
}
assert.deepEqual(identity({ NativeShell:{ AppHost:{
    appName:() => 'Jellyfin Android', appVersion:() => '9.9.9'
} } }), { appName:'Jellyfin Android', appVersion:'9.9.9' });
assert.deepEqual(identity({ NativeShell:{ AppHost:{ appName:() => 'Native client' } } }),
    { appName:'Native client', appVersion:'12.1.0' });
assert.deepEqual(identity({ NativeShell:{ AppHost:{ appVersion:() => '9.9.9' } } }),
    { appName:'Finweb', appVersion:'9.9.9' });
console.log('PASS: Finweb browser client identity and native host overrides. Package version remains semver-compatible.');
/* eslint-enable compat/compat */
