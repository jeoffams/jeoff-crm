import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

// Simple key/value API matching the previous window.storage interface.
// All CRM arrays are stored as JSONB in a single crm_data table.
export const db = {
  get: async (key) => {
    try {
      const { data, error } = await supabase
        .from('crm_data')
        .select('data')
        .eq('key', key)
        .maybeSingle()
      if (error) { console.error('db.get error:', key, error.message); return null }
      return data?.data ?? null
    } catch (e) { console.error('db.get exception:', e); return null }
  },

  set: async (key, value) => {
    try {
      const { error } = await supabase
        .from('crm_data')
        .upsert(
          { key, data: value, updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        )
      if (error) console.error('db.set error:', key, error.message)
      return !error
    } catch (e) { console.error('db.set exception:', e); return false }
  },
}
