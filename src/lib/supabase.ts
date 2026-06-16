import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables. ' +
    'Create a .env file based on .env.example'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Expose for E2E tests
if (import.meta.env.DEV || import.meta.env.PROD) {
  ;(globalThis as any).__supabase = supabase
}
