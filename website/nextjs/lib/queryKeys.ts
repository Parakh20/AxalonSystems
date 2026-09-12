/**
 * Central query-key registry.
 *
 * Keys live here rather than inline so an invalidation can never silently miss
 * a cache entry because of a typo'd string.
 */
export const queryKeys = {
  ops: {
    health: ['ops', 'health'] as const,
    orthos: (parkId: string) => ['ops', 'orthos', parkId] as const,
  },
  inventory: {
    components: ['inventory', 'components'] as const,
    prototypes: ['inventory', 'prototypes'] as const,
    orders: ['inventory', 'orders'] as const,
    /** Everything under the inventory namespace — used after any mutation. */
    all: ['inventory'] as const,
  },
  faults: {
    park: (parkId: string) => ['faults', 'park', parkId] as const,
    photos: (faultId: number) => ['faults', 'photos', faultId] as const,
  },
} as const
