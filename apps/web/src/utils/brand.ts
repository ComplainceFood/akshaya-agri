// Brand assets and palette for Akshaya Agri Solutions.
// Logo file lives in apps/web/public/logo.png and is served at /logo.png.

export const BRAND = {
  name: 'Akshaya Agri Solutions',
  tagline: 'Agri Commodities. Seamless Supply. Global Reach.',
  logoUrl: '/logo.png',
  // Brand palette (derived from the logo)
  primary: '#2e7d32',          // operational green (actions, links)
  primaryDark: '#1b5e20',
  primaryLight: '#43a047',
  accent: '#8b6f47',           // bronze/brown — from the trident in the logo
  accentDark: '#6b5230',
  ink: '#1a1a1a',              // body text
  inkSoft: '#555',
  muted: '#8a8a8a',
  page: '#f5f6fa',             // app background
  paper: '#ffffff',
  surface: '#fafbfc',
  border: '#eef0f3',
  borderSoft: '#f3f4f7',
  // Semantic
  success: '#2e7d32',
  danger: '#cf1322',
  warning: '#d97706',
  info: '#1677ff',
} as const

// Inline data URI loader for environments where the printed/exported document
// cannot reach /logo.png (e.g. cross-origin print windows). Fetched lazily on first use.
let _logoDataUri: string | null = null
let _logoPromise: Promise<string> | null = null

export async function getLogoDataUri(): Promise<string> {
  if (_logoDataUri) return _logoDataUri
  if (_logoPromise) return _logoPromise
  _logoPromise = (async () => {
    try {
      const res = await fetch(BRAND.logoUrl)
      const blob = await res.blob()
      const dataUri: string = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result))
        r.onerror = reject
        r.readAsDataURL(blob)
      })
      _logoDataUri = dataUri
      return dataUri
    } catch {
      _logoDataUri = ''
      return ''
    }
  })()
  return _logoPromise
}

// HTML snippet for the standard print/PDF header banner. Pass the data URI
// from getLogoDataUri() so the image embeds in cross-origin print windows.
export function brandPrintHeader(opts: { logoDataUri?: string; rightHtml?: string }): string {
  const { logoDataUri, rightHtml = '' } = opts
  const logoImg = logoDataUri
    ? `<img src="${logoDataUri}" alt="${BRAND.name}" class="brand-print-logo" />`
    : ''
  return `
    <div class="brand-print-header">
      <div class="brand-print-left">
        ${logoImg}
        <div>
          <div class="brand-print-name">${BRAND.name}</div>
          <div class="brand-print-tagline">${BRAND.tagline}</div>
        </div>
      </div>
      <div class="brand-print-right">${rightHtml}</div>
    </div>`
}

// Inline CSS for the print/PDF banner (kept in sync with index.css for in-app use).
export const BRAND_PRINT_CSS = `
  .brand-print-header { display:flex; justify-content:space-between; align-items:center;
    border-bottom: 2px solid ${BRAND.primary}; padding: 0 0 12px; margin-bottom: 16px; gap: 16px; }
  .brand-print-header .brand-print-left { display:flex; align-items:center; gap: 14px; }
  .brand-print-header .brand-print-logo { height: 60px; max-width: 220px; object-fit: contain; }
  .brand-print-header .brand-print-name { font-size: 17px; font-weight: 700; color: ${BRAND.primary}; letter-spacing: 0.3px; }
  .brand-print-header .brand-print-tagline { font-size: 10px; color: ${BRAND.accent}; font-style: italic; margin-top: 2px; }
  .brand-print-header .brand-print-right { text-align: right; font-size: 10px; color: ${BRAND.muted}; line-height: 1.6; }
`

