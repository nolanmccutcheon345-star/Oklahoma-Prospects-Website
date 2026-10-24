-- New editorial content only; existing pages, accounts and financial records are unchanged.
create table if not exists website_pages (
  id text primary key check (id = 'about'),
  draft_content jsonb not null,
  published_content jsonb,
  revision integer not null default 0 check (revision >= 0),
  updated_by text,
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
-- Initial About copy is stored as editable content, and never overwrites later edits.
insert into website_pages (id, draft_content, published_content, published_at)
select 'about', content, content, now() from (select jsonb_build_object(
  'eyebrow', 'About Prospects Sports Academy',
  'title', 'Developing athletes. Building confidence.',
  'intro', 'Baseball and softball bring us together. Purposeful practice, clear instruction, and a commitment to improvement move us forward.',
  'storyTitle', 'Our academy. Your place to grow.',
  'story', E'Prospects Sports Academy brings baseball and softball instruction, competitive teams, and indoor practice together in Broken Arrow, Oklahoma.\n\nFrom an athlete learning the fundamentals to a player preparing for the next level of competition, our programs create opportunities to learn, practice, and grow. Families can explore Oklahoma Prospects teams, book private lessons, attend camps and clinics, or reserve indoor cage time.',
  'missionTitle', 'Our mission',
  'mission', 'Help athletes build their skills, confidence, and love for the game through purposeful training and a supportive team environment. We value effort, accountability, and steady progress.',
  'philosophyTitle', 'How we develop players',
  'philosophy', E'Start with the fundamentals. Build sound habits through clear instruction and quality repetitions.\n\nGive every workout a purpose. Help athletes understand what they are working on and how to recognize improvement.\n\nCoach the person as well as the player. Encourage effort, responsibility, teamwork, and respect for the game.\n\nKeep developing. Use practice and competition as opportunities to learn, adjust, and come back ready for the next rep.',
  'seoTitle', 'About',
  'seoDescription', 'Get to know Prospects Sports Academy in Broken Arrow, Oklahoma: baseball and softball teams, player development, private instruction, and indoor training.'
) as content) initial
on conflict (id) do nothing;
alter table website_pages enable row level security;
revoke all on website_pages from public;
