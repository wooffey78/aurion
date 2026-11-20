import test from 'node:test';
import assert from 'node:assert/strict';
import { enhanceFormFields } from '../../assets/js/core/ui.js';

class FakeOption {
  constructor(text='', attrs={}) { this.textContent=text; this.value=''; this.dataset={...attrs}; this.selected=false; }
}

class FakeSelect {
  constructor(options=[]) {
    this.options=options;
    this.firstChild=options[0] ?? null;
    this.value='';
  }
  querySelector(selector) {
    if(selector==='option[data-aurion-placeholder]') return this.options.find(o=>o.dataset.aurionPlaceholder);
    if(selector==='option:checked') return this.options.find(o=>o.selected);
    return null;
  }
  insertBefore(node,before) {
    this.options.unshift(node);
    this.firstChild=this.options[0] ?? null;
  }
}

globalThis.document={createElement(){return new FakeOption('');}};

class FakeRoot {
  constructor(selects=[]) { this.selects=selects; }
  querySelectorAll(selector) {
    if(selector==='select') return this.selects;
    if(selector.startsWith('input') || selector.startsWith('textarea')) return [];
    return [];
  }
}

test('requirement 7 does not duplicate an existing Votre choix option',()=>{
  const existing=new FakeOption('Votre choix');
  const select=new FakeSelect([existing,new FakeOption('A')]);
  enhanceFormFields(new FakeRoot([select]));
  assert.equal(select.options.filter(o=>o.textContent==='Votre choix').length,1);
});

test('requirement 7 creates one Votre choix option when missing',()=>{
  const select=new FakeSelect([new FakeOption('A')]);
  enhanceFormFields(new FakeRoot([select]));
  assert.equal(select.options.filter(o=>o.textContent==='Votre choix').length,1);
  assert.equal(select.options[0].selected,true);
});
