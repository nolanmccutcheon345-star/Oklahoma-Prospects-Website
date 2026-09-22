-- Independent fundraising ledger; existing bookings, dues and payment records are untouched.
CREATE TABLE fundraising_players (
 id text PRIMARY KEY, owner_id text NOT NULL REFERENCES "user"(id), parent_email text NOT NULL,
 name text NOT NULL, team text NOT NULL, number text NOT NULL DEFAULT '',
 goal integer NOT NULL CHECK(goal BETWEEN 10000 AND 1000000), story text NOT NULL,
 approved integer NOT NULL DEFAULT 0 CHECK(approved IN(0,1)),
 active integer NOT NULL DEFAULT 1 CHECK(active IN(0,1)), shares integer NOT NULL DEFAULT 0,
 created text NOT NULL
);
CREATE INDEX fundraising_players_owner ON fundraising_players(owner_id);
CREATE TABLE fundraising_contributions (
 id text PRIMARY KEY,player_id text NOT NULL REFERENCES fundraising_players(id),
 donor text NOT NULL,email text NOT NULL,amount integer NOT NULL CHECK(amount BETWEEN 500 AND 1000000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','completed','failed')),
 refunded integer NOT NULL DEFAULT 0 CHECK(refunded>=0 AND refunded<=amount),
 order_id text UNIQUE,payment_id text UNIQUE,checkout_url text,receipt_url text,
 created text NOT NULL,checked text
);
CREATE INDEX fundraising_contributions_player ON fundraising_contributions(player_id);
CREATE TABLE fundraising_rate_limits(key text PRIMARY KEY,count integer NOT NULL,expires bigint NOT NULL);
