export async function authorize(_permission) {
  // The probe supplies the identity; RBAC inside the action is what we test.
  return {
    id: process.env.PROBE_USER_ID,
    name: process.env.PROBE_USER_NAME,
    email: process.env.PROBE_USER_EMAIL,
    role: process.env.PROBE_USER_ROLE,
    department: process.env.PROBE_USER_DEPT,
  };
}
export async function requireUser() { return authorize(); }
export async function requirePermission() { return authorize(); }
export async function currentUser() { return authorize(); }
