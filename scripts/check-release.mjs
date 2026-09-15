import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'dist');
const read = (file) => readFileSync(join(output, file), 'utf8');
const redirects = read('_redirects');
for (const [route, file] of [['/book', 'book.html'], ['/booking-confirmed', 'booking-confirmed.html'], ['/teams', 'teams.html']]) {
  assert(existsSync(join(output, file)), `Missing required public page: ${file}`);
  assert(redirects.split('\n').some(line => line.trim() === `${route} /${file} 200`), `Missing route: ${route}`);
}
assert(read('index.html').includes('/assets/site.js'), 'Homepage must load the Google tag initializer');
assert(read('assets/site.js').includes('gtag("config", "AW-18423856687")'), 'Wrong or missing Google Ads tag');
assert(read('book.html').includes('AW-18423856687/hGBYCJaqquwcEK_8ltFE'), 'Missing completed-booking conversion label');
assert(read('book.html').includes('window.ProspectsBookingConversion='), 'Completed-booking helper must remain inline');
assert(read('booking-confirmed.html').includes('AW-18423856687'), 'Confirmation page must load Google tag');
assert(existsSync(join(root, 'netlify/functions/bookings.mjs')), 'Missing booking API proxy');
console.log('Release checks passed: public routes, Google tag, completed-booking helper, booking API.');
