import type { PhoneStatus } from '../types'

const VALID_TRANSITIONS: Partial<Record<PhoneStatus, PhoneStatus[]>> = {
  in_stock: ['assigned', 'damaged'],
  assigned: ['sold', 'returned', 'damaged'],
  returned: ['in_stock', 'assigned', 'damaged'],
  sold:     [],
  damaged:  [],
}

export function canTransition(from: PhoneStatus, to: PhoneStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

export function getValidNextStates(current: PhoneStatus): PhoneStatus[] {
  return VALID_TRANSITIONS[current] ?? []
}
