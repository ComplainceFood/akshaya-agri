export function formatINR(amount: number | string | null | undefined): string {
  if (amount == null) return '-'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount))
}

export function formatKg(value: number | string | null | undefined): string {
  if (value == null) return '-'
  return `${Number(Number(value).toFixed(1)).toLocaleString('en-IN')} Kg`
}

export function kgToMT(kg: number | string): string {
  return `${(Number(kg) / 1000).toFixed(3)} MT`
}
