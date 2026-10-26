let session = null;
export function setSession(value){ session = value || null; return session; }
export function getCachedSession(){ return session; }
export function invalidateSession(){ session = null; }
