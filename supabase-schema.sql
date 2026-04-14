-- =============================================
-- HaNudnik - Database Schema
-- =============================================

-- APARTMENTS
create table apartments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mode text not null check (mode in ('solo', 'shared')),
  summary_day int check (summary_day between 0 and 6), -- 0=Sun, 6=Sat
  created_at timestamptz default now(),
  last_activity_at timestamptz default now()
);

-- USERS (extends Supabase auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  apartment_id uuid references apartments(id) on delete set null,
  is_away boolean default false,
  away_return_date date,
  joined_at timestamptz default now()
);

-- INVITE LINKS
create table invites (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references apartments(id) on delete cascade,
  created_by uuid not null references profiles(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '72 hours'),
  used_by uuid references profiles(id),
  used_at timestamptz
);

-- RESIDENT REMOVAL REQUESTS
create table removal_requests (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references apartments(id) on delete cascade,
  target_user_id uuid not null references profiles(id) on delete cascade,
  requested_by uuid not null references profiles(id) on delete cascade,
  approvals uuid[] default '{}',
  created_at timestamptz default now()
);

-- BILLS
create table bills (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references apartments(id) on delete cascade,
  bill_type text not null,
  amount numeric(10,2) not null,
  due_date date not null,
  month int not null check (month between 1 and 12),
  year int not null,
  is_paid boolean default false,
  paid_by uuid references profiles(id),
  paid_at timestamptz,
  added_by uuid not null references profiles(id),
  created_at timestamptz default now()
);

-- BILL TYPES (for bot reminder tracking)
create table bill_types (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references apartments(id) on delete cascade,
  name text not null,
  expected_month int check (expected_month between 1 and 12),
  unique(apartment_id, name)
);

-- SHOPPING LIST PRODUCTS (saved products with images)
create table products (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references apartments(id) on delete cascade,
  name text not null,
  image_url text,
  added_by uuid not null references profiles(id),
  created_at timestamptz default now(),
  unique(apartment_id, name)
);

-- SHOPPING LIST (active items)
create table shopping_items (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references apartments(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  name text not null,
  added_by uuid not null references profiles(id),
  is_bought boolean default false,
  bought_by uuid references profiles(id),
  bought_at timestamptz,
  created_at timestamptz default now()
);

-- TASKS (checklist)
create table tasks (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references apartments(id) on delete cascade,
  title text not null,
  frequency_type text not null check (frequency_type in ('daily', 'every_x_days', 'specific_days', 'weekly', 'biweekly', 'monthly')),
  frequency_value jsonb, -- e.g. {"days": [1,4]} for Mon+Thu, or {"every": 3} for every 3 days
  is_fixed boolean default false,
  fixed_assignee uuid references profiles(id) on delete set null,
  is_laundry boolean default false,
  created_by uuid not null references profiles(id),
  created_at timestamptz default now()
);

-- TASK INSTANCES (each occurrence of a task)
create table task_instances (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  apartment_id uuid not null references apartments(id) on delete cascade,
  due_date date not null,
  claimed_by uuid references profiles(id),
  claimed_at timestamptz,
  reminder_time time,
  is_done boolean default false,
  done_at timestamptz,
  is_overdue boolean default false,
  points_multiplier numeric(3,1) default 1.0,
  created_at timestamptz default now()
);

-- LAUNDRY SPECIAL REQUESTS
create table laundry_requests (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references apartments(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  request_text text not null,
  updated_at timestamptz default now(),
  unique(apartment_id, user_id)
);

-- CALENDAR EVENTS
create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references apartments(id) on delete cascade,
  created_by uuid not null references profiles(id),
  title text not null,
  description text,
  event_date date not null,
  event_time time,
  is_shared boolean default true,
  reminder_sent boolean default false,
  created_at timestamptz default now()
);

-- SCORES
create table scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  apartment_id uuid not null references apartments(id) on delete cascade,
  week_start date not null,
  month int not null,
  year int not null,
  points numeric(6,1) default 0,
  unique(user_id, week_start)
);

-- VETO (weekly winner reward)
create table vetos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  apartment_id uuid not null references apartments(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  week_start date not null,
  created_at timestamptz default now()
);

-- BOT MESSAGES (chat history per resident)
create table bot_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  apartment_id uuid not null references apartments(id) on delete cascade,
  message text not null,
  buttons jsonb, -- array of {label, action} for button responses
  triggered_by text, -- what caused this message (task_reminder, forfeit, etc.)
  is_read boolean default false,
  created_at timestamptz default now()
);

-- BOT RESPONSES (resident presses a button)
create table bot_responses (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references bot_messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  action text not null,
  created_at timestamptz default now()
);

-- INBOX NOTIFICATIONS
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  apartment_id uuid not null references apartments(id) on delete cascade,
  title text not null,
  body text not null,
  type text not null, -- task_reminder, forfeit, bill, shopping, calendar, system
  reference_id uuid, -- id of the related entity
  is_read boolean default false,
  push_tag text, -- web push tag for replacement
  push_sent_at timestamptz,
  created_at timestamptz default now()
);

-- =============================================
-- ENABLE ROW LEVEL SECURITY
-- =============================================

alter table apartments enable row level security;
alter table profiles enable row level security;
alter table invites enable row level security;
alter table removal_requests enable row level security;
alter table bills enable row level security;
alter table bill_types enable row level security;
alter table products enable row level security;
alter table shopping_items enable row level security;
alter table tasks enable row level security;
alter table task_instances enable row level security;
alter table laundry_requests enable row level security;
alter table calendar_events enable row level security;
alter table scores enable row level security;
alter table vetos enable row level security;
alter table bot_messages enable row level security;
alter table bot_responses enable row level security;
alter table notifications enable row level security;

-- =============================================
-- RLS POLICIES
-- =============================================

-- Profiles: user can read/update their own, and read others in same apartment
create policy "profiles_select" on profiles for select
  using (auth.uid() = id or apartment_id in (
    select apartment_id from profiles where id = auth.uid()
  ));

create policy "profiles_update" on profiles for update
  using (auth.uid() = id);

create policy "profiles_insert" on profiles for insert
  with check (auth.uid() = id);

-- Apartments: members can read their own apartment
create policy "apartments_select" on apartments for select
  using (id in (select apartment_id from profiles where id = auth.uid()));

create policy "apartments_update" on apartments for update
  using (id in (select apartment_id from profiles where id = auth.uid()));

create policy "apartments_insert" on apartments for insert
  with check (true);

-- Invites: apartment members can create/read
create policy "invites_select" on invites for select
  using (apartment_id in (select apartment_id from profiles where id = auth.uid()) or id::text = id::text);

create policy "invites_insert" on invites for insert
  with check (created_by = auth.uid());

create policy "invites_update" on invites for update
  using (true);

-- Generic apartment-scoped policy helper (applied to most tables)
-- Bills
create policy "bills_all" on bills for all
  using (apartment_id in (select apartment_id from profiles where id = auth.uid()));

-- Bill types
create policy "bill_types_all" on bill_types for all
  using (apartment_id in (select apartment_id from profiles where id = auth.uid()));

-- Products
create policy "products_all" on products for all
  using (apartment_id in (select apartment_id from profiles where id = auth.uid()));

-- Shopping items
create policy "shopping_items_all" on shopping_items for all
  using (apartment_id in (select apartment_id from profiles where id = auth.uid()));

-- Tasks
create policy "tasks_all" on tasks for all
  using (apartment_id in (select apartment_id from profiles where id = auth.uid()));

-- Task instances
create policy "task_instances_all" on task_instances for all
  using (apartment_id in (select apartment_id from profiles where id = auth.uid()));

-- Laundry requests
create policy "laundry_requests_all" on laundry_requests for all
  using (apartment_id in (select apartment_id from profiles where id = auth.uid()));

-- Calendar events
create policy "calendar_events_all" on calendar_events for all
  using (apartment_id in (select apartment_id from profiles where id = auth.uid()));

-- Scores
create policy "scores_all" on scores for all
  using (apartment_id in (select apartment_id from profiles where id = auth.uid()));

-- Vetos
create policy "vetos_all" on vetos for all
  using (apartment_id in (select apartment_id from profiles where id = auth.uid()));

-- Bot messages: only the recipient
create policy "bot_messages_select" on bot_messages for select
  using (user_id = auth.uid());

create policy "bot_messages_insert" on bot_messages for insert
  with check (true);

create policy "bot_messages_update" on bot_messages for update
  using (user_id = auth.uid());

-- Bot responses: only the user
create policy "bot_responses_all" on bot_responses for all
  using (user_id = auth.uid());

-- Notifications: only the recipient
create policy "notifications_select" on notifications for select
  using (user_id = auth.uid());

create policy "notifications_insert" on notifications for insert
  with check (true);

create policy "notifications_update" on notifications for update
  using (user_id = auth.uid());

-- Removal requests
create policy "removal_requests_all" on removal_requests for all
  using (apartment_id in (select apartment_id from profiles where id = auth.uid()));

-- =============================================
-- REALTIME
-- =============================================

alter publication supabase_realtime add table shopping_items;
alter publication supabase_realtime add table task_instances;
alter publication supabase_realtime add table bot_messages;
alter publication supabase_realtime add table notifications;
