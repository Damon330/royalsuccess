export async function getOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number,
): Promise<T> {
  void key
  void ttlSeconds
  return fetcher()
}

export async function invalidateKeys(...keys: string[]): Promise<void> {
  void keys
}

export const CK = {
  inventoryAll:        () => 'inventory:all',
  agentsTeam:          (leadId: string) => `agents:team:${leadId}`,
  salesSummary:        (agentId: string, date: string) => `sales:summary:${agentId}:${date}`,
  activityFeedPage:    (userId: string, page: number) => `activity:feed:${userId}:page:${page}`,
  receipt:             (receiptId: string) => `receipt:${receiptId}`,
  notificationsUnread: (userId: string) => `notifications:unread:${userId}`,
}
