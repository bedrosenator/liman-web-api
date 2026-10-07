export const AUTH_ROLES = {
  SUPERADMIN: 'superadmin',
  TENANT: 'tenant',
} as const;

export type AuthRoleType = (typeof AUTH_ROLES)[keyof typeof AUTH_ROLES];
