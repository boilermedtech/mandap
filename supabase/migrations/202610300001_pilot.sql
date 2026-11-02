create schema private;
revoke all on schema private from public, anon, authenticated;

create table private.mandaps (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
  upi text not null default '',
  published boolean not null default false,
  transparency boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table private.members (
  mandap_id uuid not null references private.mandaps(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner','treasurer','coordinator','volunteer','auditor')),
  active boolean not null default true,
  permissions text[] not null default '{}',
  primary key (mandap_id,user_id)
);
create unique index one_owner on private.members(mandap_id) where role='owner';
create table private.invitations (
  id uuid primary key default gen_random_uuid(),
  mandap_id uuid not null references private.mandaps(id),
  email text not null,
  role text not null check (role in ('treasurer','coordinator','volunteer','auditor')),
  expires_at timestamptz not null default now() + interval '7 days',
  unique(mandap_id,email)
);
create table private.festivals (
  id uuid primary key default gen_random_uuid(),
  mandap_id uuid not null references private.mandaps(id),
  name text not null check(length(name) between 2 and 160),
  start_date date not null,
  end_date date not null,
  venue text not null default '',
  timezone text not null default 'Asia/Kolkata',
  published boolean not null default false,
  check(end_date>=start_date),
  unique(mandap_id,id)
);
create table private.poojas (
  id uuid primary key default gen_random_uuid(),
  mandap_id uuid not null,
  festival_id uuid not null,
  name text not null check(length(name) between 2 and 160),
  instructions text not null default '',
  eligibility text not null default 'Everyone',
  pricing text not null check(pricing in ('person','person_day','family','family_day','package','fixed','custom','suggested','free')),
  amount bigint not null check(amount between 0 and 99999999999),
  capacity integer not null check(capacity between 1 and 100000),
  opens_at timestamptz not null default now(),
  closes_at timestamptz not null,
  active boolean not null default true,
  foreign key(mandap_id,festival_id) references private.festivals(mandap_id,id),
  check(closes_at>opens_at),
  unique(mandap_id,id)
);
create table private.occurrences (
  id uuid primary key default gen_random_uuid(),
  mandap_id uuid not null,
  pooja_id uuid not null,
  day date not null,
  booked integer not null default 0 check(booked>=0),
  foreign key(mandap_id,pooja_id) references private.poojas(mandap_id,id),
  unique(pooja_id,day),
  unique(mandap_id,id)
);
create table private.families (
  id uuid primary key default gen_random_uuid(),
  mandap_id uuid not null references private.mandaps(id),
  user_id uuid references auth.users(id),
  name text not null check(length(name) between 2 and 160),
  mobile text not null default '' check(mobile ~ '^[+0-9 ()-]{0,24}$'),
  participants jsonb not null check(jsonb_typeof(participants)='array' and jsonb_array_length(participants) between 1 and 30),
  unique(mandap_id,id)
);
create table private.registrations (
  id uuid primary key default gen_random_uuid(),
  mandap_id uuid not null,
  festival_id uuid not null,
  pooja_id uuid not null,
  family_id uuid not null,
  occurrence_ids uuid[] not null,
  participant_names text[] not null,
  amount bigint not null check(amount>=0),
  state text not null default 'confirmed' check(state in ('confirmed','cancelled')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key(mandap_id,festival_id) references private.festivals(mandap_id,id),
  foreign key(mandap_id,pooja_id) references private.poojas(mandap_id,id),
  foreign key(mandap_id,family_id) references private.families(mandap_id,id),
  unique(mandap_id,id)
);
create table private.slots (
  id uuid primary key default gen_random_uuid(),
  mandap_id uuid not null,
  festival_id uuid not null,
  name text not null check(length(name) between 2 and 160),
  day date not null,
  amount bigint not null check(amount between 0 and 99999999999),
  capacity integer not null default 1 check(capacity between 1 and 10000),
  booked integer not null default 0 check(booked>=0 and booked<=capacity),
  foreign key(mandap_id,festival_id) references private.festivals(mandap_id,id),
  unique(mandap_id,id)
);
create table private.bookings (
  id uuid primary key default gen_random_uuid(),
  mandap_id uuid not null,
  slot_id uuid not null,
  user_id uuid not null references auth.users(id),
  sponsor text not null check(length(sponsor) between 2 and 160),
  public_name boolean not null default false,
  state text not null default 'confirmed' check(state in ('confirmed','cancelled')),
  foreign key(mandap_id,slot_id) references private.slots(mandap_id,id),
  unique(mandap_id,id)
);
create table private.commitments (
  id uuid primary key default gen_random_uuid(),
  mandap_id uuid not null,
  festival_id uuid not null,
  user_id uuid references auth.users(id),
  registration_id uuid,
  booking_id uuid,
  label text not null,
  amount bigint not null check(amount between 0 and 99999999999),
  waived bigint not null default 0 check(waived>=0 and waived<=amount),
  cancelled boolean not null default false,
  foreign key(mandap_id,festival_id) references private.festivals(mandap_id,id),
  foreign key(mandap_id,registration_id) references private.registrations(mandap_id,id),
  foreign key(mandap_id,booking_id) references private.bookings(mandap_id,id),
  unique(mandap_id,id)
);
create table private.payments (
  id uuid primary key default gen_random_uuid(),
  mandap_id uuid not null,
  commitment_id uuid not null,
  amount bigint not null check(amount between 1 and 99999999999),
  method text not null check(method in ('cash','upi','bank')),
  reference text not null default '' check(length(reference)<=160),
  state text not null default 'submitted' check(state in ('submitted','confirmed','rejected')),
  created_by uuid not null references auth.users(id),
  verified_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key(mandap_id,commitment_id) references private.commitments(mandap_id,id),
  unique(mandap_id,id)
);
create table private.refunds (
  id uuid primary key default gen_random_uuid(),
  mandap_id uuid not null,
  payment_id uuid not null,
  amount bigint not null check(amount>0),
  reason text not null check(length(reason) between 3 and 500),
  created_at timestamptz not null default now(),
  foreign key(mandap_id,payment_id) references private.payments(mandap_id,id)
);
create table private.receipts (
  id uuid primary key default gen_random_uuid(),
  mandap_id uuid not null,
  payment_id uuid not null unique,
  number integer not null,
  created_at timestamptz not null default now(),
  foreign key(mandap_id,payment_id) references private.payments(mandap_id,id),
  unique(mandap_id,number)
);
create table private.expenses (
  id uuid primary key default gen_random_uuid(),
  mandap_id uuid not null,
  festival_id uuid not null,
  title text not null check(length(title) between 2 and 160),
  category text not null check(length(category) between 1 and 80),
  amount bigint not null check(amount between 1 and 99999999999),
  day date not null,
  paid boolean not null default true,
  state text not null default 'pending' check(state in ('pending','approved','rejected','correction','cancelled')),
  version integer not null default 1,
  created_by uuid not null references auth.users(id),
  reviewed_by uuid references auth.users(id),
  note text not null default '',
  foreign key(mandap_id,festival_id) references private.festivals(mandap_id,id),
  unique(mandap_id,id)
);
create table private.attachments (
  id uuid primary key default gen_random_uuid(),
  mandap_id uuid not null references private.mandaps(id),
  payment_id uuid,
  expense_id uuid,
  path text not null unique,
  created_by uuid not null references auth.users(id),
  check(num_nonnulls(payment_id,expense_id)=1),
  foreign key(mandap_id,payment_id) references private.payments(mandap_id,id),
  foreign key(mandap_id,expense_id) references private.expenses(mandap_id,id)
);
create table private.audit (
  id bigint generated always as identity primary key,
  mandap_id uuid not null references private.mandaps(id),
  actor uuid not null references auth.users(id),
  action text not null,
  entity_id uuid,
  created_at timestamptz not null default now()
);
create table private.requests (
  mandap_id uuid not null references private.mandaps(id),
  actor uuid not null,
  key uuid not null,
  action text not null,
  payload jsonb not null,
  result jsonb not null,
  primary key(mandap_id,actor,key)
);
create index memberships_user on private.members(user_id);
create index family_owner on private.families(mandap_id,user_id);
create index commitments_user on private.commitments(mandap_id,user_id);
create index payments_commitment on private.payments(mandap_id,commitment_id);
create unique index verified_transaction_reference on private.payments(mandap_id,method,lower(trim(reference)))
  where state='confirmed' and method<>'cash';
create index expenses_festival on private.expenses(mandap_id,festival_id);

create function private.assured() returns boolean
language sql stable security definer set search_path=private,pg_temp as $$
  select not exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified' and factor_type='totp')
    or coalesce(auth.jwt()->>'aal','aal1')='aal2'
$$;

create function private.require_assurance() returns void
language plpgsql stable security definer set search_path=private,pg_temp as $$
begin
  if not private.assured() then raise exception 'Authenticator verification required'; end if;
end $$;

create function private.allowed(m uuid, capability text) returns boolean
language sql stable security definer set search_path = private, pg_temp as $$
  select exists (
    select 1 from private.members x join private.mandaps t on t.id=x.mandap_id
    where x.mandap_id=m and x.user_id=auth.uid() and x.active and t.active and private.assured()
      and (x.role='owner' or capability='member' or capability=any(x.permissions)
        or (x.role='treasurer' and capability in ('finance','verify','expenses','approve','register'))
        or (x.role='coordinator' and capability in ('configure','register'))
        or (x.role='volunteer' and capability in ('register','expenses'))
        or (x.role='auditor' and capability in ('finance','audit')))
  )
$$;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname='private' loop
    execute format('alter table private.%I enable row level security',t);
  end loop;
end $$;
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
alter default privileges in schema private revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public;

create function public.my_workspaces() returns jsonb
language sql stable security definer set search_path=private,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'slug',t.slug,'role',x.role)), '[]')
  from private.members x join private.mandaps t on t.id=x.mandap_id
  where x.user_id=auth.uid() and x.active and t.active
$$;

create function public.create_mandap(p_name text,p_slug text) returns uuid
language plpgsql security definer set search_path=private,pg_temp as $$
declare m uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then
    raise exception 'Verify your email first';
  end if;
  if (select count(*) from private.members where user_id=auth.uid() and role='owner')>=3 then
    raise exception 'Pilot limit: three owned Mandaps per account';
  end if;
  insert into private.mandaps(name,slug) values(trim(p_name),lower(trim(p_slug))) returning id into m;
  insert into private.members(mandap_id,user_id,role) values(m,auth.uid(),'owner');
  insert into private.audit(mandap_id,actor,action,entity_id) values(m,auth.uid(),'create_mandap',m);
  return m;
end $$;

create function public.accept_invitations() returns integer
language plpgsql security definer set search_path=private,pg_temp as $$
declare invite record; n integer:=0; e text;
begin
  select lower(email) into e from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if e is null then raise exception 'Verified email required'; end if;
  for invite in select * from private.invitations where email=e and expires_at>now() for update loop
    if not exists(select 1 from private.members where mandap_id=invite.mandap_id and user_id=auth.uid() and role='owner') then
      insert into private.members(mandap_id,user_id,role) values(invite.mandap_id,auth.uid(),invite.role)
      on conflict(mandap_id,user_id) do update set role=excluded.role,active=true;
    end if;
    insert into private.audit(mandap_id,actor,action,entity_id) values(invite.mandap_id,auth.uid(),'accept_invitation',invite.id);
    delete from private.invitations where id=invite.id;
    n:=n+1;
  end loop;
  return n;
end $$;

create function private.summary(m uuid) returns jsonb
language sql stable set search_path=private,pg_temp as $$
  with collected as (
    select coalesce(sum(amount),0) n from private.payments where mandap_id=m and state='confirmed'
  ), refunded as (
    select coalesce(sum(amount),0) n from private.refunds where mandap_id=m
  ), expenditure as (
    select coalesce(sum(amount) filter(where paid),0) paid,
           coalesce(sum(amount) filter(where not paid),0) unpaid
    from private.expenses where mandap_id=m and state='approved'
  )
  select jsonb_build_object('collected',c.n,'refunded',r.n,'expenses',e.paid,
    'approved_unpaid',e.unpaid,'balance',c.n-r.n-e.paid,
    'pledged',(select coalesce(sum(amount-waived),0) from private.commitments where mandap_id=m and not cancelled),
    'outstanding',(select coalesce(sum(greatest(0,k.amount-k.waived-
       coalesce((select sum(p.amount) from private.payments p where p.commitment_id=k.id and p.state='confirmed'),0)+
       coalesce((select sum(f.amount) from private.refunds f join private.payments p on p.id=f.payment_id where p.commitment_id=k.id),0))),0)
       from private.commitments k where k.mandap_id=m and not k.cancelled))
  from collected c cross join refunded r cross join expenditure e
$$;

create function public.public_page(p_slug text) returns jsonb
language plpgsql stable security definer set search_path=private,pg_temp as $$
declare m private.mandaps; result jsonb;
begin
  select * into m from private.mandaps where slug=p_slug and active
    and (published or private.allowed(id,'member'));
  if not found then raise exception 'Mandap not found or not published'; end if;
  select jsonb_build_object('id',m.id,'name',m.name,'slug',m.slug,'upi',m.upi,
    'festivals',coalesce((select jsonb_agg(to_jsonb(f)) from private.festivals f where f.mandap_id=m.id and (f.published or private.allowed(m.id,'member'))),'[]'),
    'poojas',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('occurrences',
      (select coalesce(jsonb_agg(to_jsonb(o) order by o.day),'[]') from private.occurrences o where o.pooja_id=p.id)))
      from private.poojas p join private.festivals f on f.id=p.festival_id
      where p.mandap_id=m.id and (p.active or private.allowed(m.id,'configure')) and (f.published or private.allowed(m.id,'member'))),'[]'),
    'slots',coalesce((select jsonb_agg(to_jsonb(s)) from private.slots s join private.festivals f on f.id=s.festival_id
      where s.mandap_id=m.id and (f.published or private.allowed(m.id,'member'))),'[]'),
    'sponsors',coalesce((select jsonb_agg(jsonb_build_object('slot_id',b.slot_id,'sponsor',b.sponsor))
      from private.bookings b join private.slots s on s.id=b.slot_id join private.festivals f on f.id=s.festival_id
      where b.mandap_id=m.id and b.public_name and b.state='confirmed' and f.published),'[]'),
    'summary',case when m.transparency and m.published then
      private.summary(m.id)-'pledged'-'outstanding' else null end,
    'updated_at',(select max(created_at) from private.audit where mandap_id=m.id))
  into result;
  return result;
end $$;

create function public.workspace(p_mandap uuid) returns jsonb
language plpgsql stable security definer set search_path=private,pg_temp as $$
declare caps jsonb; member boolean; finance boolean;
begin
  perform private.require_assurance();
  if auth.uid() is null or not exists(select 1 from private.mandaps where id=p_mandap and active) then
    raise exception 'Sign in to an active Mandap';
  end if;
  member:=private.allowed(p_mandap,'member'); finance:=private.allowed(p_mandap,'finance');
  select jsonb_object_agg(c,private.allowed(p_mandap,c)) into caps
    from unnest(array['member','configure','register','finance','verify','expenses','approve','audit','owner']) c;
  -- The owner capability is intentionally not an assignable permission.
  caps:=caps||jsonb_build_object('owner',exists(select 1 from private.members where mandap_id=p_mandap and user_id=auth.uid() and role='owner' and active));
  return jsonb_build_object('capabilities',caps,
    'settings',case when (caps->>'owner')::boolean then (select to_jsonb(m) from private.mandaps m where id=p_mandap) else null end,
    'families',coalesce((select jsonb_agg(to_jsonb(f)) from private.families f where f.mandap_id=p_mandap and (f.user_id=auth.uid() or private.allowed(p_mandap,'register'))),'[]'),
    'registrations',coalesce((select jsonb_agg(to_jsonb(r)) from private.registrations r join private.families f on f.id=r.family_id
      where r.mandap_id=p_mandap and (f.user_id=auth.uid() or private.allowed(p_mandap,'register') or finance)),'[]'),
    'commitments',coalesce((select jsonb_agg(to_jsonb(k)||jsonb_build_object('paid',
      coalesce((select sum(amount) from private.payments where commitment_id=k.id and state='confirmed'),0),
      'refunded',coalesce((select sum(f.amount) from private.refunds f join private.payments p on p.id=f.payment_id where p.commitment_id=k.id),0)))
      from private.commitments k where k.mandap_id=p_mandap and (k.user_id=auth.uid() or finance or private.allowed(p_mandap,'register'))),'[]'),
    'payments',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('receipt',
      (select jsonb_build_object('number',number,'created_at',created_at) from private.receipts where payment_id=p.id),
      'refunded',coalesce((select sum(amount) from private.refunds where payment_id=p.id),0)))
      from private.payments p join private.commitments k on k.id=p.commitment_id
      where p.mandap_id=p_mandap and (k.user_id=auth.uid() or p.created_by=auth.uid() or finance or private.allowed(p_mandap,'verify'))),'[]'),
    'expenses',coalesce((select jsonb_agg(to_jsonb(e)) from private.expenses e where e.mandap_id=p_mandap
      and (finance or private.allowed(p_mandap,'approve') or e.created_by=auth.uid())),'[]'),
    'members',case when (caps->>'owner')::boolean then coalesce((select jsonb_agg(to_jsonb(x)) from private.members x where x.mandap_id=p_mandap),'[]') else '[]' end,
    'audit',case when finance or private.allowed(p_mandap,'audit') then coalesce((select jsonb_agg(to_jsonb(a)) from
      (select * from private.audit where mandap_id=p_mandap order by id desc limit 100) a),'[]') else '[]' end,
    'attachments',coalesce((select jsonb_agg(to_jsonb(a)) from private.attachments a
      where a.mandap_id=p_mandap and (finance or private.allowed(p_mandap,'verify') or private.allowed(p_mandap,'approve') or a.created_by=auth.uid()
        or exists(select 1 from private.payments p join private.commitments k on k.id=p.commitment_id where p.id=a.payment_id and k.user_id=auth.uid()))),'[]'),
    'summary',case when finance then private.summary(p_mandap) else null end);
end $$;

create function public.command(p_mandap uuid,p_action text,p_data jsonb,p_key uuid) returns jsonb
language plpgsql security definer set search_path=private,pg_temp as $$
declare
  actor uuid:=auth.uid(); required text; entity uuid; existing private.requests;
  pooja private.poojas; commitment private.commitments; payment private.payments;
  slot private.slots; expense private.expenses;
  family uuid; owner_id uuid; festival uuid; ids uuid[]; names text[]; dates date[];
  count_days integer; price bigint; total bigint; refunded bigint; receipt_number integer;
  role_name text; target uuid; result jsonb;
begin
  perform private.require_assurance();
  if actor is null then raise exception 'Sign in first'; end if;
  if p_key is null or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'A request key and object payload are required'; end if;
  if not exists(select 1 from private.mandaps where id=p_mandap and active) then raise exception 'Mandap inactive or unavailable'; end if;
  if p_action in ('register','book','donate') and not exists(select 1 from private.mandaps where id=p_mandap and published)
    and not private.allowed(p_mandap,'register') then raise exception 'Mandap not published'; end if;
  required:=case
    when p_action in ('settings','member','invite') then 'owner'
    when p_action in ('festival','festival_update','pooja','pooja_update','slot') then 'configure'
    when p_action in ('verify','reject_payment','refund','waive','cancel') then 'verify'
    when p_action in ('expense','correct_expense') then 'expenses'
    when p_action in ('review_expense','pay_expense') then 'approve'
    when p_action in ('register','book','donate','submit_payment','attach') then null
    else 'invalid' end;
  if required='invalid' then raise exception 'Unknown operation'; end if;
  if required='owner' then
    if not exists(select 1 from private.members where mandap_id=p_mandap and user_id=actor and active and role='owner') then raise exception 'Owner permission required'; end if;
  elsif required is not null and not private.allowed(p_mandap,required) then raise exception 'Permission denied: %',required;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_mandap::text||actor::text||p_key::text,0));
  select r.* into existing from private.requests r where r.mandap_id=p_mandap and r.actor=auth.uid() and r.key=p_key;
  if found then
    if existing.action<>p_action or existing.payload<>p_data then raise exception 'Request key already used with a different payload'; end if;
    return existing.result;
  end if;

  case p_action
  when 'settings' then
    update private.mandaps set name=trim(p_data->>'name'),upi=coalesce(p_data->>'upi',''),
      published=(p_data->>'published')::boolean,transparency=(p_data->>'transparency')::boolean
      where id=p_mandap returning id into entity;
    if length(p_data->>'upi')>120 then raise exception 'UPI ID too long'; end if;
  when 'member' then
    target:=(p_data->>'user_id')::uuid;
    if exists(select 1 from private.members where mandap_id=p_mandap and user_id=target and role='owner') then raise exception 'Initial owner cannot be changed in the pilot'; end if;
    if not coalesce(p_data->'permissions','[]') <@ '["configure","register","finance","verify","expenses","approve","audit"]'::jsonb then raise exception 'Invalid permission'; end if;
    update private.members set active=(p_data->>'active')::boolean,role=p_data->>'role',
      permissions=array(select jsonb_array_elements_text(coalesce(p_data->'permissions','[]')))
      where mandap_id=p_mandap and user_id=target returning user_id into entity;
    if not found then raise exception 'Member not found'; end if;
  when 'invite' then
    if (p_data->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Valid email required'; end if;
    if p_data->>'role'='owner' then raise exception 'Cannot invite another owner'; end if;
    insert into private.invitations(mandap_id,email,role) values(p_mandap,lower(trim(p_data->>'email')),p_data->>'role')
    on conflict(mandap_id,email) do update set role=excluded.role,expires_at=now()+interval '7 days' returning id into entity;
  when 'festival' then
    if not exists(select 1 from pg_timezone_names where name=coalesce(p_data->>'timezone','Asia/Kolkata')) then raise exception 'Invalid timezone'; end if;
    insert into private.festivals(mandap_id,name,start_date,end_date,venue,published,timezone)
    values(p_mandap,p_data->>'name',(p_data->>'start_date')::date,(p_data->>'end_date')::date,
      coalesce(p_data->>'venue',''),(p_data->>'published')::boolean,coalesce(p_data->>'timezone','Asia/Kolkata')) returning id into entity;
  when 'pooja' then
    festival:=(p_data->>'festival_id')::uuid;
    select array_agg(value::date order by value::date) into dates from jsonb_array_elements_text(p_data->'dates');
    if coalesce(cardinality(dates),0) not between 1 and 366 or cardinality(dates)<>(select count(distinct d) from unnest(dates) d) then raise exception 'Choose 1-366 distinct dates'; end if;
    if exists(select 1 from unnest(dates) d where not exists(select 1 from private.festivals f where f.id=festival and f.mandap_id=p_mandap and d between f.start_date and f.end_date)) then raise exception 'Pooja dates must be inside this festival'; end if;
    insert into private.poojas(mandap_id,festival_id,name,instructions,eligibility,pricing,amount,capacity,opens_at,closes_at)
    values(p_mandap,festival,p_data->>'name',coalesce(p_data->>'instructions',''),coalesce(p_data->>'eligibility','Everyone'),
      p_data->>'pricing',(p_data->>'amount')::bigint,(p_data->>'capacity')::integer,
      (p_data->>'opens_at')::timestamptz,(p_data->>'closes_at')::timestamptz) returning id into entity;
    insert into private.occurrences(mandap_id,pooja_id,day) select p_mandap,entity,d from unnest(dates) d;
  when 'festival_update' then
    update private.festivals set published=(p_data->>'published')::boolean,venue=coalesce(p_data->>'venue','')
      where id=(p_data->>'festival_id')::uuid and mandap_id=p_mandap returning id into entity;
    if not found then raise exception 'Festival not found'; end if;
  when 'pooja_update' then
    select * into pooja from private.poojas where id=(p_data->>'pooja_id')::uuid and mandap_id=p_mandap for update;
    if not found then raise exception 'Pooja not found'; end if;
    if exists(select 1 from private.occurrences where pooja_id=pooja.id and booked>(p_data->>'capacity')::integer) then raise exception 'Capacity cannot be below existing bookings'; end if;
    update private.poojas set amount=(p_data->>'amount')::bigint,capacity=(p_data->>'capacity')::integer,
      active=(p_data->>'active')::boolean,instructions=coalesce(p_data->>'instructions','')
      where id=pooja.id returning id into entity;
  when 'slot' then
    festival:=(p_data->>'festival_id')::uuid;
    if not exists(select 1 from private.festivals where id=festival and mandap_id=p_mandap and (p_data->>'day')::date between start_date and end_date) then raise exception 'Slot date must be inside this festival'; end if;
    insert into private.slots(mandap_id,festival_id,name,day,amount,capacity)
    values(p_mandap,festival,p_data->>'name',(p_data->>'day')::date,(p_data->>'amount')::bigint,(p_data->>'capacity')::integer) returning id into entity;
  when 'register' then
    select * into pooja from private.poojas where id=(p_data->>'pooja_id')::uuid and mandap_id=p_mandap and active for share;
    if not found then raise exception 'Pooja unavailable'; end if;
    if now() not between pooja.opens_at and pooja.closes_at then raise exception 'Registration window closed'; end if;
    if not exists(select 1 from private.festivals where id=pooja.festival_id and published) and not private.allowed(p_mandap,'register') then raise exception 'Festival not published'; end if;
    select array_agg(trim(value)) into names from jsonb_array_elements_text(p_data->'participants');
    if coalesce(cardinality(names),0) not between 1 and 30 or exists(select 1 from unnest(names) n where length(n) not between 1 and 120) then raise exception 'Enter 1-30 participant names'; end if;
    select array_agg(value::uuid order by value::uuid) into ids from jsonb_array_elements_text(p_data->'occurrence_ids');
    count_days:=coalesce(cardinality(ids),0);
    if count_days<1 or count_days<>(select count(distinct x) from unnest(ids) x) then raise exception 'Select distinct pooja days'; end if;
    perform 1 from private.occurrences where id=any(ids) order by id for update;
    if (select count(*) from private.occurrences where id=any(ids) and pooja_id=pooja.id and mandap_id=p_mandap)<>count_days then raise exception 'Invalid pooja days'; end if;
    if pooja.pricing='package' and count_days<>(select count(*) from private.occurrences where pooja_id=pooja.id) then raise exception 'A package includes all pooja days'; end if;
    if exists(select 1 from private.occurrences where id=any(ids) and booked+cardinality(names)>pooja.capacity) then raise exception 'Not enough places remaining'; end if;
    price:=case pooja.pricing
      when 'person' then pooja.amount*cardinality(names)
      when 'person_day' then pooja.amount*cardinality(names)*count_days
      when 'family_day' then pooja.amount*count_days
      when 'package' then pooja.amount*cardinality(names)
      when 'custom' then (p_data->>'amount')::bigint
      when 'suggested' then (p_data->>'amount')::bigint
      when 'free' then 0 else pooja.amount end;
    if price is null or price not between 0 and 99999999999 then raise exception 'Invalid registration amount'; end if;
    owner_id:=case when coalesce((p_data->>'helpdesk')::boolean,false) then null else actor end;
    if owner_id is null and not private.allowed(p_mandap,'register') then raise exception 'Help-desk permission required'; end if;
    insert into private.families(mandap_id,user_id,name,mobile,participants)
      values(p_mandap,owner_id,p_data->>'family_name',coalesce(p_data->>'mobile',''),to_jsonb(names)) returning id into family;
    insert into private.registrations(mandap_id,festival_id,pooja_id,family_id,occurrence_ids,participant_names,amount,created_by)
      values(p_mandap,pooja.festival_id,pooja.id,family,ids,names,price,actor) returning id into entity;
    update private.occurrences set booked=booked+cardinality(names) where id=any(ids);
    insert into private.commitments(mandap_id,festival_id,user_id,registration_id,label,amount)
      values(p_mandap,pooja.festival_id,owner_id,entity,pooja.name||' - '||(p_data->>'family_name'),price);
  when 'book' then
    select * into slot from private.slots where id=(p_data->>'slot_id')::uuid and mandap_id=p_mandap for update;
    if not found or slot.booked>=slot.capacity then raise exception 'Sponsorship slot unavailable'; end if;
    if not exists(select 1 from private.festivals where id=slot.festival_id and published) then raise exception 'Festival not published'; end if;
    insert into private.bookings(mandap_id,slot_id,user_id,sponsor,public_name)
      values(p_mandap,slot.id,actor,p_data->>'sponsor',(p_data->>'public_name')::boolean) returning id into entity;
    update private.slots set booked=booked+1 where id=slot.id;
    insert into private.commitments(mandap_id,festival_id,user_id,booking_id,label,amount)
      values(p_mandap,slot.festival_id,actor,entity,slot.name||' - '||(p_data->>'sponsor'),slot.amount);
  when 'donate' then
    festival:=(p_data->>'festival_id')::uuid;
    if not exists(select 1 from private.festivals where id=festival and mandap_id=p_mandap and published) then raise exception 'Festival not published'; end if;
    insert into private.commitments(mandap_id,festival_id,user_id,label,amount)
      values(p_mandap,festival,actor,'Donation',(p_data->>'amount')::bigint) returning id into entity;
  when 'submit_payment' then
    select * into commitment from private.commitments where id=(p_data->>'commitment_id')::uuid and mandap_id=p_mandap for update;
    if not found or commitment.cancelled then raise exception 'Commitment unavailable'; end if;
    if commitment.user_id is distinct from actor and not private.allowed(p_mandap,'register') and not private.allowed(p_mandap,'verify') then raise exception 'Payment permission denied'; end if;
    if p_data->>'method'<>'cash' and length(trim(coalesce(p_data->>'reference','')))<3 then raise exception 'Transaction reference required'; end if;
    insert into private.payments(mandap_id,commitment_id,amount,method,reference,created_by)
      values(p_mandap,commitment.id,(p_data->>'amount')::bigint,p_data->>'method',coalesce(p_data->>'reference',''),actor) returning id into entity;
  when 'verify','reject_payment','refund' then
    select * into payment from private.payments where id=(p_data->>'payment_id')::uuid and mandap_id=p_mandap for update;
    if not found then raise exception 'Payment not found'; end if;
    select * into commitment from private.commitments where id=payment.commitment_id for update;
    if p_action='refund' then
      if payment.state<>'confirmed' then raise exception 'Only confirmed payments can be refunded'; end if;
      select coalesce(sum(amount),0) into refunded from private.refunds where payment_id=payment.id;
      price:=(p_data->>'amount')::bigint;
      if price is null or price<=0 or price>payment.amount-refunded then raise exception 'Refund exceeds remaining payment'; end if;
      insert into private.refunds(mandap_id,payment_id,amount,reason) values(p_mandap,payment.id,price,p_data->>'reason') returning id into entity;
    elsif p_action='reject_payment' then
      if payment.state<>'submitted' then raise exception 'Only submitted payments can be rejected'; end if;
      update private.payments set state='rejected',verified_by=actor where id=payment.id returning id into entity;
    else
      entity:=payment.id;
      if payment.state='rejected' then raise exception 'Rejected payment cannot be confirmed'; end if;
      if payment.state='submitted' then
        if commitment.cancelled then raise exception 'Commitment cancelled'; end if;
        select coalesce(sum(amount),0) into total from private.payments where commitment_id=commitment.id and state='confirmed';
        select coalesce(sum(r.amount),0) into refunded from private.refunds r join private.payments p on p.id=r.payment_id where p.commitment_id=commitment.id;
        if total-refunded+payment.amount>commitment.amount-commitment.waived then raise exception 'Payment exceeds outstanding commitment'; end if;
        update private.payments set state='confirmed',verified_by=actor where id=payment.id;
        perform 1 from private.mandaps where id=p_mandap for update;
        select coalesce(max(number),0)+1 into receipt_number from private.receipts where mandap_id=p_mandap;
        insert into private.receipts(mandap_id,payment_id,number) values(p_mandap,payment.id,receipt_number);
      end if;
    end if;
  when 'waive','cancel' then
    select * into commitment from private.commitments where id=(p_data->>'commitment_id')::uuid and mandap_id=p_mandap for update;
    if not found then raise exception 'Commitment not found'; end if;
    entity:=commitment.id;
    if p_action='waive' then
      price:=(p_data->>'amount')::bigint;
      select coalesce(sum(amount),0) into total from private.payments where commitment_id=commitment.id and state='confirmed';
      if price is null or price<0 or price>commitment.amount-total then raise exception 'Waiver exceeds unpaid amount'; end if;
      update private.commitments set waived=price where id=commitment.id;
    else
      if commitment.cancelled then raise exception 'Already cancelled'; end if;
      update private.commitments set cancelled=true where id=commitment.id;
      if commitment.registration_id is not null then
        update private.occurrences o set booked=booked-cardinality(r.participant_names)
          from private.registrations r where r.id=commitment.registration_id and o.id=any(r.occurrence_ids);
        update private.registrations set state='cancelled' where id=commitment.registration_id;
      end if;
      if commitment.booking_id is not null then
        update private.slots set booked=booked-1 where id=(select slot_id from private.bookings where id=commitment.booking_id);
        update private.bookings set state='cancelled' where id=commitment.booking_id;
      end if;
    end if;
  when 'expense' then
    insert into private.expenses(mandap_id,festival_id,title,category,amount,day,paid,created_by,note)
      values(p_mandap,(p_data->>'festival_id')::uuid,p_data->>'title',p_data->>'category',(p_data->>'amount')::bigint,
      (p_data->>'day')::date,(p_data->>'paid')::boolean,actor,coalesce(p_data->>'note','')) returning id into entity;
  when 'correct_expense' then
    select * into expense from private.expenses where id=(p_data->>'expense_id')::uuid and mandap_id=p_mandap for update;
    if not found or expense.version is distinct from (p_data->>'version')::integer then raise exception 'Expense changed; reload before correcting'; end if;
    if expense.state<>'correction' or expense.created_by<>actor then raise exception 'Only the submitting member can correct a returned expense'; end if;
    update private.expenses set amount=(p_data->>'amount')::bigint,note=coalesce(p_data->>'note',''),
      state='pending',version=version+1 where id=expense.id returning id into entity;
  when 'review_expense','pay_expense' then
    select * into expense from private.expenses where id=(p_data->>'expense_id')::uuid and mandap_id=p_mandap for update;
    if not found or expense.version is distinct from (p_data->>'version')::integer then raise exception 'Expense changed; reload before reviewing'; end if;
    if p_action='pay_expense' then
      if expense.state<>'approved' or expense.paid then raise exception 'Only an approved unpaid expense can be settled'; end if;
      update private.expenses set paid=true,version=version+1,reviewed_by=actor where id=expense.id returning id into entity;
    else
      if expense.state not in ('pending','correction') or p_data->>'state' not in ('approved','rejected','correction') then raise exception 'Invalid expense transition'; end if;
      update private.expenses set state=p_data->>'state',reviewed_by=actor,version=version+1,note=coalesce(p_data->>'note','')
        where id=expense.id returning id into entity;
    end if;
  when 'attach' then
    target:=(p_data->>'target_id')::uuid;
    if p_data->>'kind'='payment' then
      if not exists(select 1 from private.payments p join private.commitments k on k.id=p.commitment_id where p.id=target and p.mandap_id=p_mandap
        and (p.created_by=actor or k.user_id=actor or private.allowed(p_mandap,'verify'))) then raise exception 'Payment upload denied'; end if;
    elsif p_data->>'kind'='expense' then
      if not exists(select 1 from private.expenses where id=target and mandap_id=p_mandap and (created_by=actor or private.allowed(p_mandap,'approve'))) then raise exception 'Expense upload denied'; end if;
    else raise exception 'Invalid attachment kind';
    end if;
    if split_part(p_data->>'path','/',1)<>p_mandap::text or split_part(p_data->>'path','/',2)<>actor::text then raise exception 'Invalid upload path'; end if;
    if not exists(select 1 from storage.objects where bucket_id='evidence' and name=p_data->>'path') then raise exception 'Upload not found'; end if;
    insert into private.attachments(mandap_id,payment_id,expense_id,path,created_by)
      values(p_mandap,case when p_data->>'kind'='payment' then target end,case when p_data->>'kind'='expense' then target end,p_data->>'path',actor) returning id into entity;
  end case;
  result:=jsonb_build_object('id',entity);
  insert into private.audit(mandap_id,actor,action,entity_id) values(p_mandap,actor,p_action,entity);
  insert into private.requests values(p_mandap,actor,p_key,p_action,p_data,result);
  return result;
end $$;

create function public.can_download(p_path text) returns boolean
language sql stable security definer set search_path=private,pg_temp as $$
  select private.assured() and exists(select 1 from private.attachments a join private.mandaps m on m.id=a.mandap_id where a.path=p_path and m.active and
    (private.allowed(a.mandap_id,'finance') or private.allowed(a.mandap_id,'verify') or private.allowed(a.mandap_id,'approve')
      or a.created_by=auth.uid() or exists(select 1 from private.payments p join private.commitments k on k.id=p.commitment_id where p.id=a.payment_id and k.user_id=auth.uid())))
$$;

revoke all on function public.public_page(text),public.my_workspaces(),public.create_mandap(text,text),
  public.accept_invitations(),public.workspace(uuid),public.command(uuid,text,jsonb,uuid),
  public.can_download(text) from public,anon,authenticated;
grant execute on function public.public_page(text) to anon,authenticated;
grant execute on function public.my_workspaces(),public.create_mandap(text,text),public.accept_invitations(),
  public.workspace(uuid),public.command(uuid,text,jsonb,uuid),public.can_download(text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('evidence','evidence',false,5242880,array['image/png']);
create policy evidence_read on storage.objects for select to authenticated
using(bucket_id='evidence' and public.can_download(name));
