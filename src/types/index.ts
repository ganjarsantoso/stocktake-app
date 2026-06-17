export interface User {
  id: string
  supabase_uid: string
  display_name: string
  created_at: string
}

export interface Dataset {
  id: string
  name: string
  created_by: string
  header_mapping: HeaderMapping | null
  created_at: string
}

export interface HeaderMapping {
  [sourceColumn: string]: string
}

export interface Item {
  id: string
  dataset_id: string
  storage_bin: string | null
  storage_type: string | null
  material_no: string
  material_description: string | null
  batch: string | null
  storage_unit: string
  quantity: number
  unit_of_quantity: string | null
}

export interface FoundLog {
  id: string
  item_id: string | null
  dataset_id: string
  found_by: string
  found_by_name: string
  material_no: string
  material_description: string | null
  storage_unit: string | null
  storage_bin: string | null
  batch: string | null
  is_manual?: boolean
  quantity?: number
  reverted_at?: string | null
  created_at: string
}

export interface ItemWithStatus extends Item {
  found_by_name: string | null
  found_at: string | null
  found_log_id: string | null
}

export interface SearchResult {
  status: 'not_found' | 'found' | 'already_found' | 'ambiguous'
  item?: Item
  candidates?: Item[]
  existingLog?: FoundLog
  message?: string
  newLogId?: string
}
