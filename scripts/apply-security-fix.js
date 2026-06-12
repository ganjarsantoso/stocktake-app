import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars')
  process.exit(1)
}

const supabase = createClient(url, key)

const sql = `
CREATE OR REPLACE FUNCTION revert_found_log(log_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE found_logs
  SET reverted_at = now(), item_id = NULL
  WHERE id = log_id AND found_by = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'found_log not found or not owned by you: %', log_id;
  END IF;
END;
$$;
`

async function main() {
  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql_text: sql })
    if (error) throw error
    console.log('✓ Applied via RPC exec_sql')
    return
  } catch (e) {
    console.log('exec_sql failed:', e.message)
  }

  try {
    const { error } = await supabase.rpc('exec', { query: sql })
    if (error) throw error
    console.log('✓ Applied via RPC exec')
    return
  } catch (e) {
    console.log('exec failed:', e.message)
  }

  // Fallback: direct SQL via REST using service_role
  try {
    const { error } = await supabase.from('_sql').insert({ sql }).maybeSingle()
    if (error) console.log('SQL insert failed:', error.message)
  } catch (e) {
    console.log('All methods failed:', e.message)
  }
}

main()
