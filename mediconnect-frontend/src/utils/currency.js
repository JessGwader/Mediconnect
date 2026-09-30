// XAF (Central African CFA franc) has no minor unit in everyday use —
// amounts are whole numbers, grouped with a thin space, e.g. "5 000 XAF".
export function formatXAF(amount) {
  return `${Number(amount).toLocaleString("fr-FR")} XAF`;
}
