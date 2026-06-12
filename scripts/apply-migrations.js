/**
 * Applies SQL migrations to Supabase.
 * Run: node scripts/apply-migrations.js
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY env var.
 * Get it from: Supabase Dashboard → Project Settings → API → service_role key
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const url = process.env.VITE_SUPABASE_URL
if (!url) {
  console.error('Missing VITE_SUPABASE_URL env var — copy from .env')
  process.exit(1)
}

const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!key) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY env var')
  console.error('Get it from: Supabase Dashboard → Project Settings → API → service_role key')
  console.error('')
  console.error('  $env:SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIs..."')
  console.error('  node scripts/apply-migrations.js')
  process.exit(1)
}

const supabase = createClient(url, key)

const migrationsDir = resolve(__dirname, '..', 'supabase', 'migrations')
const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()

for (const file of files) {
  console.log(`Running migration: ${file} ...`)
  const sql = readFileSync(resolve(migrationsDir, file), 'utf8')
  const { error } = await supabase.rpc('exec', { query: sql }).maybeSingle()
  if (error) {
    // Fallback: try direct SQL via REST
    console.log(`  RPC failed (${error.message}), trying direct query...`)
    const { error: directError } = await supabase.from('_migrations').insert({ file, sql }).maybeSingle()
    if (directError) {
      console.error(`  Failed to apply ${file}: ${directError.message}`)
    }
  } else {
    console.log(`  ✓ ${file} applied`)
  }
}

console.log('Done.')
