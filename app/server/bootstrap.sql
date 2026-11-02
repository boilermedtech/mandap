create role anon;
create role authenticated;
create schema auth;
create schema storage;
create schema local_runtime;

create table auth.users(id uuid primary key default gen_random_uuid(),email text unique not null,email_confirmed_at timestamptz);
create table auth.mfa_factors(user_id uuid,status text,factor_type text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
$$;
grant usage on schema auth to anon,authenticated;
grant execute on function auth.uid(),auth.jwt() to anon,authenticated;

create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text unique);
alter table storage.objects enable row level security;

create table local_runtime.migrations(name text primary key,checksum text not null);
create table local_runtime.codes(email text primary key,hash text not null,expires_at timestamptz not null,attempts integer not null default 0,last_sent timestamptz not null default now());
create table local_runtime.sessions(hash text primary key,user_id uuid not null references auth.users(id),expires_at timestamptz not null);
create table local_runtime.files(path text primary key,bytes bytea not null);
create table local_runtime.links(token text primary key,path text not null references local_runtime.files(path),user_id uuid not null,expires_at timestamptz not null);
revoke all on schema local_runtime from public,anon,authenticated;
