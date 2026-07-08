import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Partition items into ordered buckets. Bucket order follows `order` when
 *  given (keys not in it are dropped, matching entity lists), otherwise keys
 *  sort naturally; a null-key bucket always trails last. */
export function bucketBy<T, K>(
  items: T[], keyOf: (t: T) => K | null, order?: K[],
): [K | null, T[]][] {
  const by = new Map<K | null, T[]>()
  for (const t of items) {
    const k = keyOf(t)
    if (!by.has(k)) by.set(k, [])
    by.get(k)!.push(t)
  }
  const keys: (K | null)[] = order
    ? order.filter((k) => by.has(k))
    : ([...by.keys()].filter((k) => k !== null) as K[]).sort()
  if (by.has(null)) keys.push(null)
  return keys.map((k) => [k, by.get(k)!])
}
