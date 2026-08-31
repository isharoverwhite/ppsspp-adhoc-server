import { prisma } from '@/lib/prisma';

// Shared singleton in-memory product map cache (4,300+ game ID to human title mappings)
let cachedProductMap: Map<string, string> | null = null;
let lastProductMapFetch = 0;
const PRODUCT_MAP_TTL = 60 * 60 * 1000; // 1 hour

export async function getProductMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (cachedProductMap && (now - lastProductMapFetch) < PRODUCT_MAP_TTL) {
    return cachedProductMap;
  }

  try {
    const productIds = await prisma.$queryRaw<Array<{ id: string; name: string }>>`
      SELECT id, name FROM productids
    `;
    cachedProductMap = new Map(productIds.map(p => [p.id, p.name]));
    lastProductMapFetch = now;
    return cachedProductMap;
  } catch (error) {
    console.error('Failed to load productids from SQLite:', error);
    return cachedProductMap || new Map();
  }
}
