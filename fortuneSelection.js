export function chooseNonRepeatingFortune(categoryList, recentItems = [], random = Math.random) {
  if (!Array.isArray(categoryList) || !categoryList.length) {
    return { selected: '', recent: [] };
  }
  let recent = Array.isArray(recentItems)
    ? recentItems.filter(item => typeof item === 'string')
    : [];
  let candidates = categoryList.filter(item => !recent.includes(item));
  if (!candidates.length) {
    const last = recent[0];
    candidates = categoryList.filter(item => item !== last);
    if (!candidates.length) candidates = categoryList;
    recent = last ? [last] : [];
  }
  const selected = candidates[Math.floor(random() * candidates.length)] || candidates[0];
  const recentLimit = Math.max(Math.min(categoryList.length - 1, 12), 1);
  return {
    selected,
    recent: [selected, ...recent.filter(item => item !== selected)].slice(0, recentLimit),
  };
}
