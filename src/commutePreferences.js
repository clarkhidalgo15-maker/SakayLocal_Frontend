function storageKey(userId) {
  if (!userId) {
    throw new Error('Your passenger account could not be identified. Please log in again.');
  }
  return `sakaylokal_commute_preferences:${userId}`;
}

export function getCommutePreferences(userId) {
  const saved = localStorage.getItem(storageKey(userId));
  if (!saved) return null;

  const preferences = JSON.parse(saved);
  if (!preferences || typeof preferences.city !== 'string' || typeof preferences.area !== 'string') {
    throw new Error('Saved commute location is invalid. Please reset it in Account settings.');
  }
  return preferences;
}

export function saveCommutePreferences(userId, preferences) {
  localStorage.setItem(storageKey(userId), JSON.stringify({
    city: preferences.city,
    area: preferences.area,
  }));
}

export function removeCommutePreferences(userId) {
  localStorage.removeItem(storageKey(userId));
}
