export function hasVisibleIncomingEntries(entries: readonly { name: string }[]) {
  return entries.some((entry) => !entry.name.startsWith('.'))
}
