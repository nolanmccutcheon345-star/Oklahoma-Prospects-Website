import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

test('Coaches filters include unassigned coaches, both sports, and respect separate instructor visibility', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.invalid' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { PeopleDirectory } = await import('./people-directory.tsx');
  const { emptySharedProfile } = await import('../lib/person-contracts.ts');
  const people = [['Baseball Coach', ['baseball']], ['Softball Coach', ['softball']], ['Both Coach', ['baseball', 'softball']], ['Instructor Only', ['baseball']]].map(([name, sports]) => ({
    ...emptySharedProfile(name), sports, bio: `${name} biography`, id: name, coachId: name,
    coach: name !== 'Instructor Only', instructor: name === 'Instructor Only', bookable: false, serviceIds: [], teams: [],
  }));
  const host = document.getElementById('root');
  const root = createRoot(host);
  const names = () => [...host.querySelectorAll('article h2')].map(x => x.textContent);
  const filter = async name => React.act(async () => [...host.querySelectorAll('[aria-pressed]')].find(x => x.textContent === name).click());
  try {
    await React.act(async () => root.render(React.createElement(PeopleDirectory, { people, kind: 'coaches' })));
    assert.deepEqual(names(), ['Baseball Coach', 'Softball Coach', 'Both Coach']);
    await filter('baseball'); assert.deepEqual(names(), ['Baseball Coach', 'Both Coach']);
    await filter('softball'); assert.deepEqual(names(), ['Softball Coach', 'Both Coach']);
    await filter('all'); assert.equal(names().length, 3);
    await React.act(async () => host.querySelector('article button[aria-expanded]').click());
    assert.match(host.querySelector('article div:not([hidden])[id]').textContent, /Baseball Coach biography/);
  } finally { await React.act(async () => root.unmount()); dom.window.close(); }
});
