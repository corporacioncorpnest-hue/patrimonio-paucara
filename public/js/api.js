// Helper de peticiones al backend
export async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (res.status === 401) { location.href = '/'; throw new Error('No autenticado'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error de servidor');
  return data;
}

export async function protegerPagina() {
  try {
    const me = await api('/api/me');
    document.querySelectorAll('.user-nombre').forEach(el => el.textContent = me.nombre);
    document.querySelectorAll('.user-rol').forEach(el => el.textContent = me.rol);
    return me;
  } catch { location.href = '/'; }
}

export function logout() {
  document.getElementById('logout')?.addEventListener('click', async e => {
    e.preventDefault();
    await api('/api/logout', { method: 'POST' });
    location.href = '/';
  });
}

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}