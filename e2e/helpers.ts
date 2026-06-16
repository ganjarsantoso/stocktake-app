import type { Page } from '@playwright/test'
import { testDatasetName, testUserName, generateItems, TEST_DS_PREFIX } from './fixtures'

const SB_URL = process.env.VITE_SUPABASE_URL!
const SB_KEY = process.env.VITE_SUPABASE_ANON_KEY!

interface SessionToken {
  access_token: string
  user: { id: string }
}

function tokenKey(): string {
  const ref = SB_URL.replace(/^https?:\/\//, '').split('.')[0]
  return `sb-${ref}-auth-token`
}

async function getSession(page: Page): Promise<SessionToken | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    try { return JSON.parse(raw) } catch { return null }
  }, tokenKey())
}

export async function authedFetch(page: Page, path: string, options: RequestInit = {}) {
  const session = await getSession(page)
  if (!session) throw new Error('No Supabase session found in localStorage')

  const url = `${SB_URL}${path}`
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${session.access_token}`,
    'apikey': SB_KEY,
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }

  const res = await page.evaluate(async ({ url, headers, options }) => {
    return fetch(url, { ...options, headers })
      .then(r => r.text())
      .then(text => {
        try { return JSON.parse(text) } catch { return text }
      })
  }, { url, headers, options })

  return res
}

export async function loginAsUser(page: Page, name?: string) {
  const displayName = name || testUserName()
  await page.goto('/login')
  await page.waitForSelector('input[type="text"]', { timeout: 10000 })
  await page.fill('input[type="text"]', displayName)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.includes('login'), { timeout: 20000 })
  return displayName
}

export async function seedDataset(page: Page, name?: string, itemCount = 5): Promise<string> {
  const dsName = name || testDatasetName()

  // Use Supabase client library (already authenticated in the page) instead of REST API
  const dsId = await page.evaluate(async (n) => {
    const supabase = (window as any).__supabase
    if (!supabase) throw new Error('supabase not exposed')
    const { data: ds, error: dsErr } = await supabase.from('datasets').insert({ name: n }).select().single()
    if (dsErr) throw new Error(`dataset insert: ${dsErr.message}`)
    return ds.id
  }, dsName)

  const items = generateItems(dsId, itemCount)
  const created = await page.evaluate(async ({ dsId, items }) => {
    const supabase = (window as any).__supabase
    const { data, error } = await supabase.from('items').insert(items).select()
    if (error) throw new Error(`items insert: ${error.message}`)
    return data
  }, { dsId, items })
  if (!created || created.length === 0) throw new Error('Failed to create items')

  return dsId
}

export async function seedFoundLog(page: Page, itemId: string) {
  return authedFetch(page, `/rest/v1/found_logs?select=found_by_name,id&id=eq.${itemId}`, { method: 'GET' })
}

export async function cleanupTestData(page: Page, datasetId?: string) {
  const ids = datasetId
    ? [{ id: datasetId }]
    : await authedFetch(page, `/rest/v1/datasets?name=like.${TEST_DS_PREFIX}%&select=id`, { method: 'GET' })
  for (const ds of ids) {
    await authedFetch(page, `/rest/v1/found_logs?dataset_id=eq.${ds.id}`, { method: 'DELETE' })
    await authedFetch(page, `/rest/v1/items?dataset_id=eq.${ds.id}`, { method: 'DELETE' })
    await authedFetch(page, `/rest/v1/datasets?id=eq.${ds.id}`, { method: 'DELETE' })
  }
}

export async function cleanupUserFoundLogs(page: Page) {
  const session = await getSession(page)
  if (!session) return
  await authedFetch(page, `/rest/v1/found_logs?found_by=eq.${session.user.id}`, { method: 'DELETE' })
}

export async function createItemAndMarkFound(page: Page, datasetId: string) {
  const items = generateItems(datasetId, 1)
  const created: any = await authedFetch(page, '/rest/v1/items', {
    method: 'POST',
    body: JSON.stringify(items),
  })
  const item = Array.isArray(created) ? created[0] : created
  if (!item?.id) throw new Error('Failed to create item')

  const session = await getSession(page)
  const logPayload = {
    item_id: item.id,
    dataset_id: datasetId,
    found_by: session?.user?.id,
    found_by_name: 'E2E Tester',
    material_no: item.material_no,
    material_description: item.material_description,
    storage_unit: item.storage_unit,
    storage_bin: item.storage_bin,
    batch: item.batch,
    is_manual: false,
  }
  await authedFetch(page, '/rest/v1/found_logs', {
    method: 'POST',
    body: JSON.stringify(logPayload),
  })

  return { item, datasetId }
}
