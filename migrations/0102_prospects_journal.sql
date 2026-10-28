-- Editorial domain only. No existing account is granted access and no article is published.
create table journal_grants (
 user_id text primary key references "user"(id), revision integer not null default 1,
 permissions text[] not null default '{}', sports text[] not null default '{}', team_ids text[] not null default '{}',
 updated_by text not null references "user"(id), updated_at timestamptz not null default now(),
 check(permissions <@ array['view','create','edit.own','edit.all','submit','review','approve','publish','categories','features','seo']::text[]),
 check(sports <@ array['baseball','softball','academy']::text[])
);
create table journal_categories (id text primary key, name text not null, slug text not null unique, description text not null default '', display_order integer not null default 0, active boolean not null default true, revision integer not null default 1);
insert into journal_categories(id,name,slug,display_order) values
 ('development','Player Development','player-development',1),('baseball','Baseball','baseball',2),('softball','Softball','softball',3),('teams','Team News','team-news',4),('academy','Facility & Academy','facility-academy',5),('people','Coaches & Players','coaches-players',6),('college-pro','Professional & College Sports','professional-college-sports',7),('parents','Parent Resources','parent-resources',8);
create table journal_articles (
 id uuid primary key, revision integer not null default 1 check(revision>0),
 status text not null default 'draft' check(status in ('draft','pending','approved','scheduled','published','archived')),
 document jsonb not null, created_by text references "user"(id), updated_by text references "user"(id),
 approved_revision integer, approved_by text references "user"(id), scheduled_at timestamptz,
 published_revision integer, published_at timestamptz, updated_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create table journal_revisions (article_id uuid not null references journal_articles(id),revision integer not null,document jsonb not null,editor_id text references "user"(id),created_at timestamptz not null default now(),primary key(article_id,revision));
create table journal_publications (article_id uuid primary key references journal_articles(id), revision integer not null, document jsonb not null, approved_by text not null references "user"(id), published_by text not null references "user"(id), published_at timestamptz not null default now(), updated_at timestamptz not null default now(), visible boolean not null default false);
-- A slug stays reserved after withdrawal or rename; redirects always target an article, never another redirect.
create table journal_slugs (slug text primary key, article_id uuid not null references journal_articles(id));
create table journal_media (id uuid primary key,article_id uuid not null references journal_articles(id), uploaded_by text not null references "user"(id), webp_base64 text not null, width integer not null,height integer not null,credit text not null,rights_note text not null,created_at timestamptz not null default now());
create table journal_consents (id uuid primary key, article_id uuid not null references journal_articles(id),revision integer not null,athlete_id text not null references club_athletes(id), guardian_id text not null references "user"(id), scope text not null, evidence_reference text not null, recorded_by text not null references "user"(id), recorded_at timestamptz not null default now(), revoked_at timestamptz,revoked_by text references "user"(id),unique(article_id,revision,athlete_id));
create table journal_audit (id bigserial primary key,article_id uuid,actor_id text,action text not null,details jsonb not null default '{}',created_at timestamptz not null default now());
create table journal_metrics (article_id uuid not null references journal_articles(id),day date not null,event text not null check(event in ('view','cta')),count bigint not null default 0,primary key(article_id,day,event));
create table journal_settings (id boolean primary key default true check(id),metrics_enabled boolean not null default false,revision integer not null default 1);
insert into journal_settings(id) values(true);
create index journal_status_schedule on journal_articles(status,scheduled_at);
create index journal_public_sport on journal_publications((document->>'sport')) where visible;
create index journal_search on journal_publications using gin(to_tsvector('english',coalesce(document->>'title','')||' '||coalesce(document->>'excerpt',''))) where visible;
create index journal_consent_article on journal_consents(article_id,revision) where revoked_at is null;
create index journal_media_article on journal_media(article_id);
create trigger immutable_journal_revisions before update or delete on journal_revisions for each row execute function protect_club_audit();
create trigger immutable_journal_revisions_truncate before truncate on journal_revisions for each statement execute function protect_club_audit();
create trigger immutable_journal_audit before update or delete on journal_audit for each row execute function protect_club_audit();
create trigger immutable_journal_audit_truncate before truncate on journal_audit for each statement execute function protect_club_audit();
do $$ declare t text; begin foreach t in array array['journal_grants','journal_categories','journal_articles','journal_revisions','journal_publications','journal_slugs','journal_media','journal_consents','journal_audit','journal_metrics','journal_settings'] loop execute format('alter table %I enable row level security',t);execute format('revoke all on %I from public',t);end loop;end $$;
-- Search indexes the public manuscript, never internal planning or consent evidence.
alter table journal_publications add column search_text text not null default '';
create index journal_manuscript_search on journal_publications using gin(to_tsvector('english',search_text)) where visible;
-- The same current verified guardian relationship as currentPublicationGuardian.
-- A consent withdrawal or account/household relationship change immediately removes the row.
create view journal_visible_publications as select p.* from journal_publications p where p.visible
 and (not coalesce((p.document->>'containsMinorIdentity')::boolean,false) or jsonb_array_length(coalesce(p.document->'athleteIds','[]'::jsonb))>0)
 and not exists(select 1 from jsonb_array_elements_text(coalesce(p.document->'athleteIds','[]'::jsonb)) athlete(id) where not exists(
  select 1 from journal_consents c join club_athletes a on a.id=c.athlete_id
  join "user" u on u.id=c.guardian_id join profiles pr on pr.user_id=u.id join club_households h on h.id=a.household_id
  where c.article_id=p.article_id and c.revision=p.revision and c.athlete_id=athlete.id and c.revoked_at is null
   and u."emailVerified" and u."disabledAt" is null
   and (exists(select 1 from person_guardian_links g where g.user_id=u.id and g.household_id=h.id)
    or(pr.role<>'player' and exists(select 1 from household_members m where m.user_id=u.id and m.household_id=h.id)))
 ));
revoke all on journal_visible_publications from public;
