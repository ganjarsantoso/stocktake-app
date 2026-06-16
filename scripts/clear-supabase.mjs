import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

const { data: { session }, error } = await supabase.auth.signInAnonymously()
if (error) { console.error('Auth error:', error.message); process.exit(1) }
console.log('Signed in as:', session.user.id)

const tables = ['found_logs', 'items', 'datasets', 'users']
for (const table of tables) {
  const { error: delErr } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (delErr) {
    console.log(`${table}: DELETE failed — ${delErr.message}`)
  } else {
    console.log(`${table}: cleared successfully`)
  }
}
