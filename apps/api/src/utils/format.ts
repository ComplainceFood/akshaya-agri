export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount)
}

export function quintalsToMT(quintals: number): number {
  return quintals / 10
}

export function mtToQuintals(mt: number): number {
  return mt * 10
}
