import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY
export const supabase = createClient(supabaseUrl, supabaseKey)

// ── Row-level CRM storage ─────────────────────────────────────────────────────
// Array keys (jw, ja, jb, jcr, jf, jc, jpen) are stored as individual rows:
//   key = "{tab}_entry_{id}",  data = the entry object
// Meta keys (jsid, etc.) are stored as single rows unchanged.
// db.upsert(tab, entry)  → writes ONE row, no collision with concurrent writes
// db.remove(tab, id)     → deletes ONE row
// db.set(tab, array)     → smart bulk: upserts all, deletes removed (used for bulk ops)
// db.get(tab)            → reads all matching rows and returns as array

const ARRAY_KEYS = new Set(['jw','ja','jb','jcr','jf','jc','jpen','jton'])
const eKey = (tab, id) => tab + '_entry_' + id
const ePfx = (tab) => tab + '_entry_'

export const db = {
  get: async (key) => {
    try {
      if (ARRAY_KEYS.has(key)) {
        const { data, error } = await supabase
          .from('crm_data').select('data').like('key', ePfx(key) + '%')
        if (error) { console.error('db.get', key, error.message); return [] }
        return (data || []).map(r => r.data)
      }
      const { data, error } = await supabase
        .from('crm_data').select('data').eq('key', key).maybeSingle()
      if (error) { console.error('db.get', key, error.message); return null }
      return data?.data ?? null
    } catch (e) { console.error('db.get ex', e); return ARRAY_KEYS.has(key) ? [] : null }
  },

  set: async (key, value) => {
    try {
      if (ARRAY_KEYS.has(key)) {
        if (!Array.isArray(value)) return false
        const ts = new Date().toISOString()
        if (value.length === 0) {
          await supabase.from('crm_data').delete().like('key', ePfx(key) + '%')
          return true
        }
        const rows = value.map(e => ({ key: eKey(key, e.id), data: e, updated_at: ts }))
        const { error } = await supabase.from('crm_data').upsert(rows, { onConflict: 'key' })
        if (error) { console.error('db.set upsert', key, error.message); return false }
        const newKeys = new Set(value.map(e => eKey(key, e.id)))
        const { data: ex } = await supabase.from('crm_data').select('key').like('key', ePfx(key) + '%')
        const toDel = (ex || []).map(r => r.key).filter(k => !newKeys.has(k))
        for (const k of toDel) await supabase.from('crm_data').delete().eq('key', k)
        return true
      }
      const { error } = await supabase.from('crm_data')
        .upsert({ key, data: value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      if (error) { console.error('db.set meta', key, error.message); return false }
      return true
    } catch (e) { console.error('db.set ex', e); return false }
  },

  // Safe single-entry write — the key fix for concurrent edit safety
  upsert: async (key, entry) => {
    try {
      const { error } = await supabase.from('crm_data')
        .upsert({ key: eKey(key, entry.id), data: entry, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      if (error) { console.error('db.upsert', key, error.message); return false }
      return true
    } catch (e) { console.error('db.upsert ex', e); return false }
  },

  // Safe single-entry delete
  remove: async (key, id) => {
    try {
      const { error } = await supabase.from('crm_data').delete().eq('key', eKey(key, id))
      if (error) { console.error('db.remove', key, error.message); return false }
      return true
    } catch (e) { console.error('db.remove ex', e); return false }
  }
}
