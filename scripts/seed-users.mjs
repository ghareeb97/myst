import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables."
  );
}

const supabase = createClient(url, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const defaultPassword = process.env.MYST_SEED_PASSWORD ?? "ChangeMe!123";
const users = [
  {
    email: "manager@myst.local",
    password: defaultPassword,
    fullName: "Myst Manager",
    role: "manager"
  },
  {
    email: "sales1@myst.local",
    password: defaultPassword,
    fullName: "Myst Sales 1",
    role: "sales"
  },
  {
    email: "sales2@myst.local",
    password: defaultPassword,
    fullName: "Myst Sales 2",
    role: "sales"
  }
];

async function findUserByEmail(email) {
  const pageSize = 1000;
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: pageSize
    });
    if (error) throw error;
    const match = data.users.find((user) => user.email === email);
    if (match) return match;
    if (data.users.length < pageSize) return null;
    page += 1;
  }
}

for (const user of users) {
  let authUser = await findUserByEmail(user.email);

  if (!authUser) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true
    });
    if (error) throw error;
    authUser = data.user;
    console.log(`Created auth user: ${user.email}`);
  } else {
    console.log(`Auth user exists: ${user.email}`);
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: authUser.id,
      full_name: user.fullName,
      role: user.role,
      is_active: true
    },
    { onConflict: "id" }
  );

  if (profileError) throw profileError;
  console.log(`Upserted profile: ${user.email} (${user.role})`);
}

console.log("Seed complete.");
