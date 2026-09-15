export const ROLE_PERMISSIONS: Record<string, string[]> = {
  USER: ['read:own', 'write:own'],
  ADMIN: ['read:own', 'write:own', 'read:any', 'write:any', 'delete:any'],
};

export function getRolePermissions(role: string): string[] {
  return ROLE_PERMISSIONS[role] || [];
}

export function hasPermission(role: string, permission: string): boolean {
  const permissions = getRolePermissions(role);
  return permissions.includes(permission) || permissions.includes('write:any');
}

export function canEditResource(userId: string, resourceUserId: string, role: string = 'USER'): boolean {
  if (hasPermission(role, 'write:any')) return true;
  return userId === resourceUserId;
}
