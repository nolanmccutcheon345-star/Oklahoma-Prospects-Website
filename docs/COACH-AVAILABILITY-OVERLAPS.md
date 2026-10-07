# Coach availability overlaps

Saving coach availability rejects duplicate or overlapping windows on the same weekday before identity lookup or writes. Adjacent windows and the same interval on different weekdays remain valid. Existing stored windows and booking rules are unchanged.

Tests exercise duplicate, partial/nested overlap, adjacency, weekday separation and early service rejection. No hosted booking or payment test is claimed.
