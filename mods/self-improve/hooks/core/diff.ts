// A unified diff of two texts, line by line (longest common subsequence), for the Drafts tab.

export function unifiedDiff(before: string, after: string, name = 'SKILL.md', cap = 400): string {
  const a = before.replace(/\r\n/g, '\n').split('\n').slice(0, cap)
  const b = after.replace(/\r\n/g, '\n').split('\n').slice(0, cap)
  const n = a.length
  const m = b.length
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
  const lines: string[] = []
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      lines.push(` ${a[i]}`)
      i++
      j++
    } else if (j < m && (i >= n || lcs[i]![j + 1]! >= lcs[i + 1]![j]!)) {
      lines.push(`+${b[j]}`)
      j++
    } else {
      lines.push(`-${a[i]}`)
      i++
    }
  }
  return [`--- a/${name}`, `+++ b/${name}`, `@@ -1,${n} +1,${m} @@`, ...lines].join('\n')
}
