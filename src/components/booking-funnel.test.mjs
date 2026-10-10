import {catalogFixture} from "../lib/testing/catalog-fixture.ts";
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

test('booking review uses current availability, correct rates and matching consent', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.invalid' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { BookingFunnel } = await import('./booking-funnel.tsx');
  const { buildPublicCatalog } = await import('../lib/ops.ts');
  const { reservationSlots, chicagoDateISO } = await import('../lib/hours.ts');
  const host = document.getElementById('root');
  const root = createRoot(host);
  let review;
  const pending = [];
  const loadAvailability = input => new Promise(resolve => pending.push({ input, resolve }));
  const click = async selector => React.act(async () => host.querySelector(selector).click());
  const resolveLatest = async () => {
    const req = pending.at(-1);
    await React.act(async () => req.resolve(reservationSlots(req.input.date, req.input.duration)));
  };
  try {
    await React.act(async () => root.render(React.createElement(BookingFunnel, { catalog: await catalogFixture(), loadAvailability, onReview: value => { review = value; } })));
    assert.match(host.textContent, /Select your space and time to see your total/);
    assert.equal(host.querySelector('[data-cage-total]'), null);
    await click('[data-cage-id="1"]');
    const obsolete = pending.at(-1);
    await click('[data-cage-id="2"]');
    await resolveLatest();
    await click('input[name="time"]');
    assert.equal(host.querySelector('[data-cage-total]').dataset.cageTotal, '105');
    await React.act(async () => obsolete.resolve([]));
    assert.equal(host.querySelector('[data-cage-total]').dataset.cageTotal, '105');
    await click('[data-household-attest]');
    await React.act(async () => host.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(review.cages, '1,2');
    assert.equal(review.use, 'household');
    assert.equal(review.date, chicagoDateISO());
    await click('[data-cage-id="5"]');
    assert.equal(host.querySelector('[data-cage-total]'), null);
    assert.equal(host.querySelector('input[name="party"][value="team"]').checked, true);
    assert.match(host.textContent, /selecting 3\+ spaces applies team pricing/);
    assert.equal(host.querySelector('[data-household-attest]'), null);
    await resolveLatest();
    await click('input[name="time"]');
    assert.equal(host.querySelector('[data-cage-total]').dataset.cageTotal, '187.5');
    await click('input[name="duration"][value="30"]');
    assert.equal(host.querySelector('[data-cage-total]'), null);
    assert.equal(host.querySelector('[data-booking-review]').dataset.bookingReview, 'false');
    await resolveLatest();
    await click('input[name="time"]');
    assert.equal(host.querySelector('[data-cage-total]').dataset.cageTotal, '93.75');
  } finally {
    await React.act(async () => root.unmount());
    dom.window.close();
  }
});
