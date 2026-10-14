import { describe, expect, it } from 'vitest';

const views = {
  vote: () => import('../../public/js/views/vote.js'),
  suggest: () => import('../../public/js/views/suggest.js'),
  history: () => import('../../public/js/views/history.js'),
};

describe.each(Object.entries(views))('%s view stub', (_name, load) => {
  it('mounts and updates a non-empty placeholder without throwing', async () => {
    const { mount, update } = await load();
    const el = document.createElement('div');
    const ctx = { employee: { id: 1, name: 'A' }, state: {}, api: {}, refresh: async () => {} };

    expect(() => mount(el, ctx)).not.toThrow();
    expect(el.innerHTML).not.toBe('');

    el.innerHTML = '';
    expect(() => update({ round: 2 })).not.toThrow();
    expect(el.innerHTML).not.toBe('');
  });
});
