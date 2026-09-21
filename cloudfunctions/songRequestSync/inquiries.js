function validateInquiries(entries) {
  if (!Array.isArray(entries) || entries.length > 200) throw new Error('INVALID_JOURNAL');
  const ids = new Set();
  return entries.map((entry) => {
    if (!entry || !['philosophy', 'poetry', 'internet', 'memes'].includes(entry.topic)) throw new Error('INVALID_JOURNAL');
    const result = { topic: entry.topic };
    for (const [key, max] of [['id', 100], ['question', 1000], ['insight', 10000]]) {
      if (typeof entry[key] !== 'string' || entry[key].length > max) throw new Error('INVALID_JOURNAL');
      result[key] = entry[key].trim();
    }
    if (!result.id || !result.question || ids.has(result.id)) throw new Error('INVALID_JOURNAL');
    ids.add(result.id);
    return result;
  });
}
module.exports = { validateInquiries };
