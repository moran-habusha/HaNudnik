import pg from 'pg'
const { Client } = pg

// Direct postgres connection via Supabase
const client = new Client({
  connectionString: 'postgresql://postgres.pmygnsldvqrsexotfuzz:' + process.env.DB_PASS + '@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
})

await client.connect()

const fixes = [
  `drop policy if exists "apartments_insert" on apartments`,
  `create policy "apartments_insert" on apartments for insert with check (true)`,
  `drop policy if exists "profiles_select" on profiles`,
  `create or replace function get_my_apartment_id() returns uuid language sql security definer stable as $$ select apartment_id from profiles where id = auth.uid() $$`,
  `create policy "profiles_select" on profiles for select using (auth.uid() = id or apartment_id = get_my_apartment_id())`,
]

for (const sql of fixes) {
  try {
    await client.query(sql)
    console.log('OK:', sql.slice(0, 60))
  } catch (e) {
    console.log('ERR:', e.message)
  }
}

await client.end()
console.log('Done!')
