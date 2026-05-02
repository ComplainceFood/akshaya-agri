import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export async function getNextNumber(db: SupabaseClient, prefix: string): Promise<string> {
  const now = new Date()
  const month = now.getMonth()
  const calYear = now.getFullYear()
  const fyStart = month >= 3 ? calYear : calYear - 1
  const year = `${String(fyStart).slice(-2)}${String(fyStart + 1).slice(-2)}`
  const id = `${prefix}-${year}`

  // Upsert sequence row and increment atomically via RPC
  const { data, error } = await db.rpc('increment_sequence', { seq_id: id, seq_prefix: prefix, seq_year: year })
  if (error) throw new Error(`Sequence error: ${error.message}`)

  return `${prefix}-${year}-${String(data).padStart(4, '0')}`
}
