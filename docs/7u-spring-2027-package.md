# 7U Spring 2027 — owner review

Status: draft; not approved for payments or public release.

Confirmed by Coach Steve: 11 players; 10 paying families; head coach's child has free dues; Indian Springs league and four tournaments; Spring 2027.

## Budget

| Item | Calculation | Team total | Basis |
|---|---:|---:|---|
| Indian Springs league | 11 × $200 | $2,200 | Planning allowance; 2027 quote NOT verified |
| Four tournaments | 4 × $300 | $1,200 | Planning allowance; events not chosen; confirm entry/umpire charges |
| Indoor team practice | 22 × 1.5 hours × $60 | $1,980 | Existing younger-team package; one cage, one 90-minute session weekly |
| Uniforms | 11 × $150 | $1,650 | Planning allowance for two jerseys, two pants, one hat; vendor quote needed |
| Player insurance | 11 × $49 | $539 | Previously supplied club budget rate; confirm current coverage |
| Free cage benefit reserve | 11 × $300 | $3,300 | Previously approved reserve, not full retail value; one 30-minute slot weekly/player |
| Club management | 11 × $150 | $1,650 | Earlier draft planning rate; owner approval required |
| Team baseballs | $300/team | $300 | Previously approved |
| Team registration | $129/team | $129 | Previously approved; remove if included in league fee |
| Base budget | | $12,948 | |
| Contingency | 10% | $1,294.80 | Earlier draft percentage; owner approval required |
| Target net revenue | | $14,242.80 | |
| Gross revenue required | $14,242.80 ÷ 0.965 | $14,759.38 | Assumed 3.5% processing; confirm actual provider fees |
| Break-even dues | $14,759.38 ÷ 10 | $1,475.94 | Ten paying families |
| Proposed rounded dues | 10 × $1,495 | $14,950 | NOT approved |

At $1,495 × 10, less assumed 3.5% processing, net is $14,426.75: $183.95 above the contingency-inclusive target. Do not add another processing surcharge if pricing already includes this allowance. Fixed transaction fees are not included.

Proposed four payments: $373.75 each on Jan 1, Feb 1, Mar 1, Apr 1, 2027. No automatic charges are configured. Coach fee waiver is owner-administered; no self-selected free enrollment in the family form.

## Verify before final pricing

- Indian Springs 2027 7U league eligibility, returning/new team roster placement, roster deadline, fee basis (player or team), insurance and USSSA registration inclusions.
- Four tournament choices and total mandatory entry/umpire charges. Spectator admission and family travel are excluded from package.
- Uniform quote, sizes and ordering deadline.
- Confirm the $150/player management allowance and 3.5% processing assumption.
- Coach identity and practice day/time. No public dates or coach name invented.
- Outdoor practice-field rentals remain separate.
- Existing cage benefit reserve is $300/player; 22 weekly half-hour visits have $550 retail value at $50/hr. This is a utilization reserve, not a promise that unlimited use costs only $300.

## Research on September 14, 2026

- https://bayouthbaseball.com/home — currently lists Fall 2026 offerings. The $240 fee is for a practice league, explicitly not recreational player registration. Do NOT use as the Spring 2027 7U league quote.
- https://jenksbaseball.com/PROGRAMS/Tournaments — 2026 tournament schedule offers historical comparisons only, not confirmed 2027 fees or a selected event list.

## Implementation

- /7u: proposed package, dues estimate, payment dates, parent registration request.
- /7u-request-received: dedicated post-submission page; no claim of payment or confirmed roster.
- Netlify form: 7u-spring-2027-registration. Collects athlete name/DOB, guardian contact, current team/coach, payment preference, acknowledgement. No card data; no child account.
- 7U in existing roster age selection and inquiry dropdown; Teams section links to package.
- Native Netlify form POST with honeypot, required fields and hidden package version. Verify Netlify form detection and one synthetic submission after publishing, before sharing with families. Notification routing must be verified separately; no automatic email/text promises.
- No Ads account work, conversion changes, automatic billing, roster cap enforcement, league registration or tournament purchases.
