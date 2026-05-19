const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function requireEnv() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase env: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
  }
}


export async function supabaseRpc(fnName, args) {
  requireEnv();
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args ?? {}),
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = (data && (data.message || data.error_description || data.error)) || res.statusText;
    throw new Error(message);
  }
  return data;
}

export async function supabaseSelect(table, queryString) {
  requireEnv();
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}${queryString}`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = (data && (data.message || data.error_description || data.error)) || res.statusText;
    throw new Error(message);
  }
  return data;
}

export async function supabaseUpsert(table, rows) {
  requireEnv();
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(rows),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = (data && (data.message || data.error_description || data.error)) || res.statusText;
    throw new Error(message);
  }
  return data;
}

export async function supabaseDelete(table, queryString) {
  requireEnv();
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}${queryString}`, {
    method: 'DELETE',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      Prefer: 'return=representation',
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = (data && (data.message || data.error_description || data.error)) || res.statusText;
    throw new Error(message);
  }
  return data;
}

export async function supabaseUpdate(table, row, queryString) {
  requireEnv();
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}${queryString}`, {
    method: 'PATCH',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = (data && (data.message || data.error_description || data.error)) || res.statusText;
    throw new Error(message);
  }
  return data;
}

