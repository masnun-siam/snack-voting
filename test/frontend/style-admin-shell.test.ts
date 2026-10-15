import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { mount } from '../../public/js/admin/pin.js';

const html = readFileSync('public/admin.html', 'utf8');
const doc = new DOMParser().parseFromString(html, 'text/html');

describe('admin shell styling (FR-15)', () => {
  it('links the shared stylesheet and has no inline <style>', () => {
    expect(doc.querySelector('link[rel="stylesheet"][href="/css/theme.css"]')).not.toBeNull();
    expect(doc.querySelector('style')).toBeNull();
  });

  it('gives the sections the card class and the container the stack class', () => {
    for (const id of ['menu', 'employees', 'controls']) {
      expect(doc.getElementById(id)!.classList.contains('card'), id).toBe(true);
    }
    expect(doc.getElementById('admin-sections')!.classList.contains('stack')).toBe(true);
  });

  it('PIN prompt: alert has the alert class and the form has the row class', () => {
    const el = document.createElement('div');
    mount(el, { api: {}, onAccept: () => {} });
    expect(el.querySelector('[role="alert"]')!.classList.contains('alert')).toBe(true);
    expect(el.querySelector('form')!.classList.contains('row')).toBe(true);
  });
});
