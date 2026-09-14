/* eslint-disable compat/compat -- Isolated developer checks run in Node 24 and jsdom. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { JSDOM } from 'jsdom';

const filename = new URL('../src/components/multiSelect/multiSelect.js', import.meta.url);
const source = ts.createSourceFile('multiSelect.js', await readFile(filename, 'utf8'), ts.ScriptTarget.Latest, true);
// Keep the actual module logic; replace only imports with isolated service fixtures.
const code = source.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(source)).join('\n')
    .replace('export default function (options)', 'function MultiSelect(options)')
    .replaceAll('export const ', 'const ')
    .replace("import('../../elements/emby-checkbox/emby-checkbox')", 'loadCheckbox()');
const browser = new JSDOM('<!doctype html><body></body>');
const { window } = browser;
const { document } = window;
window.Element.prototype.getClientRects = function () {
    return this.isConnected ? [{}] : [];
};
const timers = new Map();
let timerId = 0;
const imports = [];
const context = {
    window, document, MutationObserver:window.MutationObserver, console,
    browser:{ touch:false }, appHost:{ supports:()=>false }, AppFeature:{},
    globalize:{ translate:key=>key }, datetime:{ toLocaleString:String },
    dom:{ parentWithClass:(element, name)=>element.closest(`.${name}`),
        parentWithAttribute:(element, name)=>element.closest(`[${name}]`),
        addEventListener:(element, ...args)=>element.addEventListener(...args),
        removeEventListener:(element, ...args)=>element.removeEventListener(...args) },
    setTimeout:callback=>{
        const id = ++timerId;
        timers.set(id, callback);
        return id;
    },
    clearTimeout:id=>timers.delete(id),
    loadCheckbox:()=>new Promise(resolve=>imports.push(resolve))
};
// eslint-disable-next-line sonarjs/code-eval -- Execute only the trusted checkout module above with fixture globals.
const { MultiSelect, startMultiSelect, stopMultiSelect } = vm.runInNewContext(`${code}\n({MultiSelect,startMultiSelect,stopMultiSelect})`, context);
function list(name) {
    const container = document.createElement('div');
    container.className = 'itemsContainer';
    container.innerHTML = `<div class="card" data-id="${name}"><div class="cardBox"></div></div>`;
    document.body.append(container);
    return { container, card:container.firstElementChild, instance:new MultiSelect({ container }) };
}
function down(card, button = 0) {
    card.dispatchEvent(new window.MouseEvent('mousedown', { bubbles:true, button, clientX:20, clientY:20 }));
}
function fireTimers() {
    for (const [id, callback] of [...timers]) {
        timers.delete(id);
        callback();
    }
}
async function resolveImports() {
    imports.splice(0).forEach(resolve=>{
        resolve();
    });
    await Promise.resolve();
    await Promise.resolve();
}
const panelCount = () => document.querySelectorAll('.selectionCommandsPanel').length;
try {
    const first = list('first');
    const other = list('other');
    for (const button of [1, 2, 3, 4]) {
        down(first.card, button);
        assert.equal(timers.size, 0, `Mouse button ${button} must not start selection`);
    }
    down(first.card);
    document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles:true }));
    assert.equal(timers.size, 0, 'Release outside the card cancels the hold');
    for (const [target, event] of [[document, 'pointercancel'], [window, 'blur'], [window, 'popstate'], [document, 'viewbeforehide'], [document, 'pagebeforeshow']]) {
        down(first.card);
        target.dispatchEvent(new window.Event(event));
        assert.equal(timers.size, 0, event);
        down(first.card);
        fireTimers();
        target.dispatchEvent(new window.Event(event));
        await resolveImports();
        assert.equal(panelCount(), 0, `${event} invalidates deferred controls`);
    }
    down(first.card);
    fireTimers();
    await resolveImports();
    assert.equal(panelCount(), 1, 'Valid left-button hold still works');
    assert.equal(first.container.querySelectorAll('.itemSelectionPanel').length, 1);
    assert.equal(other.container.querySelectorAll('.itemSelectionPanel').length, 0, 'Selection is scoped to its own list');
    document.dispatchEvent(new window.MouseEvent('mouseup'));
    assert.equal(panelCount(), 1, 'Completed selection survives release');
    other.instance.destroy();
    assert.equal(panelCount(), 1, 'Unrelated list cleanup does not cancel selection');
    first.card.remove();
    await Promise.resolve();
    assert.equal(panelCount(), 0, 'Replacing selected cards clears stale selection');
    first.instance.destroy();
    first.container.remove();
    other.container.remove();

    for (const deferred of [false, true]) {
        const current = list(`destroy-${deferred}`);
        down(current.card);
        if (deferred) fireTimers();
        current.instance.destroy();
        assert.equal(timers.size, 0);
        fireTimers();
        await resolveImports();
        assert.equal(panelCount(), 0, 'Unmount cannot create a delayed selection panel');
        current.container.remove();
    }
    const menuList = list('menu');
    startMultiSelect(menuList.card);
    await resolveImports();
    assert.equal(panelCount(), 1, 'Explicit context-menu selection still works');
    stopMultiSelect();
    startMultiSelect(menuList.card);
    menuList.card.remove();
    await resolveImports();
    assert.equal(panelCount(), 0, 'Detached context-menu target is ignored');
    menuList.instance.destroy();
    console.log('PASS: primary mouse input, release/cancel, browser back, view changes, delayed imports, destroy, list ownership, card replacement and context-menu selection.');
} finally {
    stopMultiSelect();
    window.close();
}
/* eslint-enable compat/compat */
