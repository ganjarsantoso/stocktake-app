export const TEST_DS_PREFIX = 'e2e-test-'

export function testDatasetName(): string {
  return `${TEST_DS_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export function testUserName(): string {
  return `E2E User ${Date.now()}`
}

let itemSeq = 0

export function generateItems(datasetId: string, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const seq = ++itemSeq
    return {
      dataset_id: datasetId,
      storage_unit: `${Date.now()}${seq}`,
      storage_bin: i % 2 === 0 ? `BIN-${seq}` : null,
      material_no: `MAT-${String(seq).padStart(3, '0')}`,
      material_description: `Test Material ${seq}`,
      batch: i % 3 === 0 ? `BATCH-${seq}` : null,
      quantity: Math.floor(Math.random() * 100) + 1,
      unit_of_quantity: 'EA',
    }
  })
}
