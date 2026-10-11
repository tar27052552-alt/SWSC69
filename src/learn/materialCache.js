// Signed URLs stay in component memory; never persist them in browser storage.
export function materialIsFresh(material, now = Date.now()) {
  return Boolean(material?.url && Date.parse(material.expiresAt) > now + 60000);
}
