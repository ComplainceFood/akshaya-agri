// Run with: npx tsx supabase/seed-auth.ts
// Creates the admin user in Supabase Auth to match the existing DB user

const SUPABASE_URL = 'https://qgwpmyawcxczjqyzuwsd.supabase.co'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function seedAuth() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: 'admin@akshayaagri.com',
      password: 'Admin@123',
      email_confirm: true,
    }),
  })
  const data = await res.json()
  if (res.ok) {
    console.log('✅ Admin user created in Supabase Auth:', data.id)
  } else if (data.msg?.includes('already')) {
    console.log('ℹ️  Admin user already exists in Supabase Auth')
  } else {
    console.error('❌ Error:', data)
  }
}

seedAuth()
