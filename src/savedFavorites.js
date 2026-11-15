function storageKey(userId) {
  if (!userId) {
    throw new Error('Your passenger account could not be identified. Please log in again.');
  }
  return `sakaylokal_saved_favorites:${userId}`;
}

export function getSavedFavorites(userId) {
  const saved = localStorage.getItem(storageKey(userId));
  if (!saved) return [];

  const favorites = JSON.parse(saved);
  if (!Array.isArray(favorites) || favorites.some(item => (
    !item
    || !['route', 'terminal'].includes(item.type)
    || !Number.isInteger(Number(item.id))
    || typeof item.title !== 'string'
    || typeof item.path !== 'string'
  ))) {
    throw new Error('Your saved favorites could not be read. Remove the invalid saved data and try again.');
  }
  return favorites;
}

export function toggleSavedFavorite(userId, item) {
  const favorites = getSavedFavorites(userId);
  const exists = favorites.some(favorite => favorite.type === item.type && Number(favorite.id) === Number(item.id));
  const nextFavorites = exists
    ? favorites.filter(favorite => favorite.type !== item.type || Number(favorite.id) !== Number(item.id))
    : [...favorites, {
      type: item.type,
      id: Number(item.id),
      title: String(item.title),
      subtitle: String(item.subtitle || ''),
      path: String(item.path),
      savedAt: new Date().toISOString(),
    }];
  localStorage.setItem(storageKey(userId), JSON.stringify(nextFavorites));
  return nextFavorites;
}

export function clearSavedFavorites(userId) {
  localStorage.removeItem(storageKey(userId));
}
