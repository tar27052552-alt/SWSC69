export function mediaKey(item) {
  return item.type === 'video' ? `video:${item.videoId}` : `document:${item.path}`;
}

export function topicMedia(topic) {
  const resources = topic?.resources || [];
  return [...resources.filter(item => item.type === 'document'),
    ...resources.filter(item => item.type === 'video')];
}

export function positionStorageKey(userId) {
  return `swsc-learning-position:civic-dna-2026:${userId}`;
}

export function readLocalPosition(userId) {
  if (!userId) return null;
  try { return JSON.parse(localStorage.getItem(positionStorageKey(userId)) || 'null'); }
  catch { return null; }
}

export function writeLocalPosition(userId, position) {
  if (!userId) return;
  try { localStorage.setItem(positionStorageKey(userId), JSON.stringify(position)); }
  catch { /* Learning remains available when browser storage is full or disabled. */ }
}

export function latestPosition(...positions) {
  return positions.filter(item => item?.subjectId && item?.topicId && item?.resourceKey)
    .sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0))[0] || null;
}
