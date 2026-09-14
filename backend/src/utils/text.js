export function normalize(value) {
  return String(value || "").normalize("NFC").toLocaleLowerCase("vi").trim();
}

export function tokenize(value, { minLength = 2, stopWords = new Set() } = {}) {
  return (normalize(value).match(/[\p{L}\p{N}]+/gu) || [])
    .filter((token) => token.length >= minLength && !stopWords.has(token));
}

export function phraseSet(tokens, widths = [3, 2]) {
  const phrases = new Set();
  for (const width of widths) {
    for (let index = 0; index <= tokens.length - width; index += 1) {
      phrases.add(tokens.slice(index, index + width).join(" "));
    }
  }
  return phrases;
}
