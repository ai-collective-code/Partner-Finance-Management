// Local (non-Clerk) partner/employee JWTs expire after 24h. A stored session that
// outlives its token would otherwise look signed-in while every API call 401s, so
// treat an expired or unreadable token as no session at all.
export function isTokenExpired(token) {
  if (!token) return true;
  try {
    const [, payload] = token.split('.');
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    if (!decoded.exp) return false;
    return decoded.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

export function clearLocalSession() {
  localStorage.removeItem('vendorToken');
  localStorage.removeItem('vendorUser');
  localStorage.removeItem('employeeToken');
  localStorage.removeItem('employeeUser');
}
