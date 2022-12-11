export function sqlQuoteString(s: string) {
  return `'${s.replace(/'/g, "''")}'`
}
