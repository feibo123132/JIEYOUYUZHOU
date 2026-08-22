import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  setExclusiveSectionCollapsed,
  setParameterPanelHidden,
} from '../src/panelUiState.js';

class FakeClassList {
  constructor(...names) { this.names = new Set(names); }
  contains(name) { return this.names.has(name); }
  toggle(name, force) {
    if (force === undefined ? !this.names.has(name) : force) this.names.add(name);
    else this.names.delete(name);
  }
}

function fakeElement(...classes) {
  const attributes = new Map();
  return {
    classList: new FakeClassList(...classes),
    textContent: '',
    setAttribute: (name, value) => attributes.set(name, String(value)),
    getAttribute: (name) => attributes.get(name),
  };
}

function fakeSection(collapsed) {
  return {
    root: fakeElement(...(collapsed ? ['collapsed'] : [])),
    heading: fakeElement(),
  };
}

{
  const body = fakeSection(false);
  const coat = fakeSection(true);
  const nestedDisclosure = fakeElement();
  setExclusiveSectionCollapsed([body, coat], coat, false);
  assert.equal(body.root.classList.contains('collapsed'), true, 'opening a section closes its peer');
  assert.equal(coat.root.classList.contains('collapsed'), false);
  assert.equal(body.heading.getAttribute('aria-expanded'), 'false');
  assert.equal(coat.heading.getAttribute('aria-expanded'), 'true');
  assert.equal(nestedDisclosure.classList.contains('collapsed'), false, 'nested disclosures are untouched');

  setExclusiveSectionCollapsed([body, coat], coat, true);
  assert.equal(body.root.classList.contains('collapsed'), true);
  assert.equal(coat.root.classList.contains('collapsed'), true, 'the active section may close with none open');
}

{
  const app = fakeElement();
  const panel = fakeElement();
  const button = fakeElement();
  const label = fakeElement();
  const labels = {
    hide: '收起参数面板',
    hideAria: '收起参数面板',
    show: '展开参数',
    showAria: '展开参数面板',
  };

  setParameterPanelHidden({ app, panel, button, label }, true, labels);
  assert.equal(app.classList.contains('parameter-panel-hidden'), true);
  assert.equal(panel.getAttribute('aria-hidden'), 'true');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(button.getAttribute('aria-label'), labels.showAria);
  assert.equal(label.textContent, labels.show);

  setParameterPanelHidden({ app, panel, button, label }, false, labels);
  assert.equal(app.classList.contains('parameter-panel-hidden'), false);
  assert.equal(panel.getAttribute('aria-hidden'), 'false');
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(button.getAttribute('aria-label'), labels.hideAria);
  assert.equal(label.textContent, labels.hide);
}

{
  const [html, css] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/style.css', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="parameter-panel-toggle"/, 'scene exposes a full-panel visibility button');
  assert.match(css, /\.parameter-panel-hidden\s+#panel/, 'hidden state removes the complete parameter panel');
}

console.log('panel UI state checks passed');
