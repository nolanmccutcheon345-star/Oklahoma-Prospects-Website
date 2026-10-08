# Coach availability validation

Availability input now validates real 24-hour clocks, opening/closing hours and start-before-end in the shared API schema and at the underlying server save before coach lookup. Empty windows remain a valid deliberate removal.

The legacy schedule reader ignores malformed clocks, window text, invalid duration/time arguments and nonstring fields rather than treating them as valid slots or crashing the picker. Supported 24-hour and AM/PM formats remain supported. No existing schedules are rewritten.

Validation covers invalid requests before identity/DB work and valid legacy formats. No schema, payment operation or policy change. Third of five continuation PRs, stacked on the inactive-coach guard. Hosted role/browser acceptance remains separate.
