/* Whoever the test says is at the screen. The permission check is the real one
   from lib/rbac.ts, so a refusal here is the refusal production would give;
   nobody signed in is the website's own case. */
const rbac = () => require(`${process.cwd()}/lib/rbac.ts`);

function who() {
  const user = globalThis.__TEST_ACTOR;
  if (!user) throw new Error("Not signed in.");
  return user;
}

async function authorize(permission) {
  const user = who();
  const { can, isStaff } = rbac();
  if (!isStaff(user.role)) throw new Error("Not permitted.");
  if (!can(user.role, permission)) {
    throw new Error("You do not have permission to do that.");
  }
  return user;
}

async function authorizeAny(permissions) {
  const user = who();
  const { can, isStaff } = rbac();
  if (!isStaff(user.role)) throw new Error("Not permitted.");
  if (!permissions.some((p) => can(user.role, p))) {
    throw new Error("You do not have permission to do that.");
  }
  return user;
}

async function authorizeCustomer() {
  const user = who();
  if (user.role !== "CUSTOMER" || !user.customerId) throw new Error("Not permitted.");
  return user;
}

module.exports = {
  currentUser: async () => globalThis.__TEST_ACTOR ?? null,
  requireUser: async () => who(),
  requireStaff: async () => who(),
  requirePermission: authorize,
  authorize,
  authorizeAny,
  authorizeCustomer,
  requireCustomer: authorizeCustomer,
};
