const MAX_CATEGORY_NAME_LENGTH = 60;

export function normalizeCategoryName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

export function validateCategoryName(value: unknown):
  | { success: true; name: string; nameNormalized: string }
  | { success: false; error: string } {
  if (typeof value !== 'string') {
    return { success: false, error: 'Category name must be text.' };
  }

  const name = value.trim().replace(/\s+/g, ' ');
  if (!name) return { success: false, error: 'Category name is required.' };
  if (name.length > MAX_CATEGORY_NAME_LENGTH) {
    return { success: false, error: `Category name must be ${MAX_CATEGORY_NAME_LENGTH} characters or fewer.` };
  }

  return { success: true, name, nameNormalized: normalizeCategoryName(name) };
}
