/* eslint-disable compat/compat -- Developer checks run in Node 24. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
async function source(relative) {
    return ts.createSourceFile(relative, await readFile(new URL(relative, root), 'utf8'), ts.ScriptTarget.Latest, true);
}
function find(node, predicate) {
    if (predicate(node)) return node;
    return ts.forEachChild(node, child => find(child, predicate));
}
function compile(text, bindings) {
    const javascript = ts.transpileModule(text, { compilerOptions:{ target:ts.ScriptTarget.ES2022 } }).outputText;
    // eslint-disable-next-line sonarjs/code-eval -- Only evaluate declarations from this trusted checkout, with fixture globals.
    return vm.runInNewContext(javascript, bindings);
}

const queries = await source('src/hooks/useFetchItems.ts');
const placeholder = find(queries, node => ts.isPropertyAssignment(node) && node.name.getText(queries) === 'placeholderData');
const retain = compile(`(${placeholder.initializer.getText(queries)})`, { currentApi:{ user:{ Id:'user' } }, parentId:'movies', viewType:'Movies' });
const previous = { Items:[{ Id:'one' }] };
assert.equal(retain(previous, { queryKey:['User', 'user', 'Items', 'movies', 'ViewByType', 'Movies'] }), previous);
for (const key of [
    ['User', 'other', 'Items', 'movies', 'ViewByType', 'Movies'],
    ['User', 'user', 'Items', 'other', 'ViewByType', 'Movies'],
    ['User', 'user', 'Items', 'movies', 'ViewByType', 'Series']
]) assert.equal(retain(previous, { queryKey:key }), undefined);
assert.equal(retain(previous, undefined), undefined);

const home = await source('src/apps/modern/routes/home.tsx');
const loadTab = find(home, node => ts.isVariableDeclaration(node) && node.name.getText(home) === 'loadTab');
const loads = [];
const busy = [];
const tabController = { current:null };
const load = compile(`(${loadTab.initializer.arguments[0].getText(home)})`, {
    loadRequest:{ current:0 }, setIsLoading:value=>busy.push(value), tabController,
    layoutManager:{ tv:false }, console,
    getTabController: async index => ({
        index, refreshed:false,
        onResume:()=>new Promise(resolve=>loads.push({ index, resolve }))
    })
});
const first = load(0, null);
await new Promise(resolve => setTimeout(resolve, 0));
const second = load(1, 0);
await new Promise(resolve => setTimeout(resolve, 0));
loads[0].resolve();
await first;
assert.equal(busy.at(-1), true);
assert.equal(tabController.current, null);
loads[1].resolve();
await second;
assert.equal(busy.at(-1), false);
assert.equal(tabController.current.index, 1);

const apiSource = await source('src/hooks/useApi.tsx');
const apiEffect = find(apiSource, node => ts.isCallExpression(node) && node.expression.getText(apiSource) === 'useEffect'
    && node.arguments[0].getText(apiSource).includes('currentApiClient'));
async function checkUserInitialization(action) {
    let resolveUser;
    const listeners = new Map();
    const state = { loading:true, user:undefined };
    const initialize = compile(`(${apiEffect.arguments[0].getText(apiSource)})`, {
        console,
        ServerConnections:{ currentApiClient:()=>({ getCurrentUser:()=>new Promise(resolve=>{
            resolveUser = resolve;
        }) }), getApiClient:()=>({}) },
        events:{ on:(_target, event, handler)=>listeners.set(event, handler), off:(_target, event)=>listeners.delete(event) },
        setUser:value=>{
            state.user = value;
        },
        setLegacyApiClient:()=>{ /* Not needed for the initialization race checks. */ },
        setIsUserLoading:value=>{
            state.loading = value;
        }
    });
    const dispose = initialize();
    assert.equal(state.loading, true);
    if (action === 'logout') listeners.get('localusersignedout')();
    if (action === 'signin') listeners.get('localusersignedin')(undefined, { Id:'new' });
    if (action === 'dispose') dispose();
    resolveUser({ Id:'old' });
    await new Promise(resolve=>setTimeout(resolve, 0));
    const expectedUser = { signin:'new', normal:'old' }[action];
    assert.equal(state.user?.Id, expectedUser);
    assert.equal(state.loading, action === 'dispose');
    dispose();
}
for (const action of ['normal', 'logout', 'signin', 'dispose']) await checkUserInitialization(action);

const player = await source('src/plugins/htmlVideoPlayer/plugin.js');
const playMethod = find(player, node => ts.isMethodDeclaration(node) && node.name.getText(player) === 'play');
const stopMethod = find(player, node => ts.isMethodDeclaration(node) && node.name.getText(player) === 'stop');
const Probe = compile(`(class {
 #subtitlePlaybackGeneration=0; #videoDialog; #playbackDiagnosticStartedAt; #playbackDiagnosticSequence;
 #started; #timeUpdated; #currentTime; #mediaElement; #currentSrc;
 constructor(remove){this.#videoDialog={classList:{remove}};}
 resetTextSubtitlePipeline(){this.#subtitlePlaybackGeneration++;}
 resetSubtitleOffset(){} logPlaybackDiagnostic(){} #applyAspectRatio(){} getAspectRatio(){return 'auto';}
 updateVideoUrl(){} setCurrentSrc(){return 'playing';} destroyCustomTrack(){} destroy(){}
 ${playMethod.getText(player)}
 ${stopMethod.getText(player)}
})`, { performance, appSettings:{ get:()=>false }, console, onEndedInternal:()=>undefined });
const removed = [];
const probe = new Probe(value=>removed.push(value));
probe.createMediaElement = ()=>Promise.reject(new Error('failed'));
await assert.rejects(probe.play({}), /failed/);
assert.deepEqual(removed, ['videoPlayerContainer-onTop']);
removed.length = 0;
let rejectOld;
probe.createMediaElement = ()=>new Promise((resolve, reject)=>{
    rejectOld = reject;
});
const old = probe.play({});
probe.resetTextSubtitlePipeline();
rejectOld(new Error('old request'));
await assert.rejects(old, /old request/);
assert.deepEqual(removed, []);
await probe.stop(false);
assert.deepEqual(removed, ['videoPlayerContainer-onTop']);
console.log('PASS: scoped retained library data, stale home loading completion, playback failure/cancellation and stale failure isolation.');
/* eslint-enable compat/compat */
