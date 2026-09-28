import { supabase } from '../supabaseClient';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function requireEnv() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase env: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
  }
}

async function authHeaders(extra = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${session?.access_token || supabaseAnonKey}`,
    ...extra,
  };
}


export async function supabaseRpc(fnName, args) {
  requireEnv();
  const headers = await authHeaders({ 'Content-Type': 'application/json' });
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(args ?? {}),
  });

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  if (!res.ok) {
    const message = (data && (data.message || data.error_description || data.error)) || res.statusText;
    throw new Error(message);
  }
  return data;
}

export async function supabaseSelect(table, queryString) {
  requireEnv();
  const headers = await authHeaders();
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}${queryString}`, {
    headers,
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  if (!res.ok) {
    const message = (data && (data.message || data.error_description || data.error)) || res.statusText;
    throw new Error(message);
  }
  return data;
}

export async function supabaseUpsert(table, rows) {
  requireEnv();
  const headers = await authHeaders({
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=representation',
  });
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}?on_conflict=id`, {
    method: 'POST',
    headers,
    body: JSON.stringify(rows),
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  if (!res.ok) {
    const message = (data && (data.message || data.error_description || data.error)) || res.statusText;
    throw new Error(message);
  }
  return data;
}

export async function supabaseDelete(table, queryString) {
  requireEnv();
  const headers = await authHeaders({ Prefer: 'return=representation' });
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}${queryString}`, {
    method: 'DELETE',
    headers,
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  if (!res.ok) {
    const message = (data && (data.message || data.error_description || data.error)) || res.statusText;
    throw new Error(message);
  }
  return data;
}

export async function supabaseUpdate(table, row, queryString) {
  requireEnv();
  const headers = await authHeaders({
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  });
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}${queryString}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(row),
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  if (!res.ok) {
    const message = (data && (data.message || data.error_description || data.error)) || res.statusText;
    throw new Error(message);
  }
  return data;
}

