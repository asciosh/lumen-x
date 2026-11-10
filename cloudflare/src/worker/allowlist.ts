/** GitHub usernames allowed to use the app: separated by commas, spaces or new lines; the case does not matter. */
export function allowedUsers(list: string | undefined): Set<string> {
  return new Set((list ?? "").split(/[\s,]+/).map((u) => u.trim().toLowerCase()).filter((u) => u.length > 0));
}

export const isAllowed = (login: string, list: string | undefined): boolean => allowedUsers(list).has(login.toLowerCase());
