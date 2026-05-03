export function formatINR(amount: number | string | null | undefined): string {
  if (amount == null) return '-'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount))
}

export function formatQt(value: number | string | null | undefined): string {
  if (value == null) return '-'
  return `${Number(Number(value).toFixed(3)).toLocaleString('en-IN')} Qt`
}

export function qtToMT(qt: number | string): string {
  return `${(Number(qt) / 10).toFixed(3)} MT`
}
