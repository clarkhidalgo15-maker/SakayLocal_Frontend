const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost/Finalproject_Transports/LavaLust/public/api';

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body === undefined) {
    headers['Content-Type'] = 'text/plain;charset=UTF-8';
  } else if (typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json;charset=UTF-8';
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
  const responseText = await response.text();
  let payload = null;
  if (responseText) {
    try {
      payload = JSON.parse(responseText);
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    const detail = payload?.error || payload?.message || responseText;
    const error = new Error(detail || `API request failed with ${response.status}`);
    error.status = response.status;
    throw error;
  }
  if (!payload) {
    throw new Error(responseText
      ? 'The server returned an invalid response. Please check the backend logs.'
      : `The server returned an empty response (HTTP ${response.status}). Please check that the backend is running.`);
  }
  return payload;
}

function accountRequest(path, options = {}) {
  const account = JSON.parse(localStorage.getItem('sakaylokal_user') || 'null');
  if (!account?.access_token) {
    return Promise.reject(new Error('Please log in to manage your account.'));
  }
  const headers = { Authorization: `Bearer ${account.access_token}`, ...(options.headers || {}) };
  return request(path, { ...options, headers }).catch(error => {
    if (error.status === 401) {
      localStorage.removeItem('sakaylokal_user');
      localStorage.removeItem('sakaylokal_admin');
      window.location.assign('/login');
    }
    throw error;
  });
}

export function getAccount() {
  return accountRequest('/account');
}

export function getMyReports() {
  return accountRequest('/account/reports');
}

export function updateAccount(formData) {
  return accountRequest('/account', { method: 'POST', body: formData });
}

export function changeAccountPassword(currentPassword, newPassword) {
  return accountRequest('/account/password', {
    method: 'POST',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

export function getPublicAsset(path) {
  return `${API_BASE.replace(/\/api\/?$/, '')}/${String(path || '').replace(/^\/+/, '')}`;
}

export function getTerminals() {
  return request('/terminals');
}

export function getRoutes() {
  return request('/routes');
}

export function getAreas() {
  return request('/areas');
}

export function getAdvisories() {
  return request('/advisories');
}

export function getReport(reference) {
  return request(`/report?reference=${encodeURIComponent(reference.trim())}`);
}

export function submitReport(payload) {
  const account = JSON.parse(localStorage.getItem('sakaylokal_user') || 'null');
  const headers = account?.role === 'passenger' && account.access_token
    ? { Authorization: `Bearer ${account.access_token}` }
    : {};
  return request('/reports', { method: 'POST', headers, body: JSON.stringify(payload) });
}

export function login(identifier, password) {
  return request('/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) });
}

export function register(payload) {
  return request('/auth/register', { method: 'POST', body: JSON.stringify(payload) });
}

export function adminRequest(path, method = 'GET', body) {
  const account = JSON.parse(localStorage.getItem('sakaylokal_admin') || 'null');
  if (!account?.access_token) {
    return Promise.reject(new Error('Your admin session is missing or expired. Please log in again.'));
  }
  const headers = account?.access_token ? { Authorization: `Bearer ${account.access_token}` } : {};
  const requestBody = body instanceof FormData ? body : body ? JSON.stringify(body) : undefined;
  return request(`/admin/${path}`, { method, headers, body: requestBody }).catch(error => {
    if (error.status === 401) {
      localStorage.removeItem('sakaylokal_admin');
      localStorage.removeItem('sakaylokal_user');
      if (window.location.pathname.startsWith('/admin')) {
        window.location.assign('/login');
      }
    }
    throw error;
  });
}

export function changeAdminPassword(currentPassword, newPassword) {
  return adminRequest('account/password', 'POST', {
    current_password: currentPassword,
    new_password: newPassword,
  });
}
