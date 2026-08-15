/**
 * Placeholder contact value written by the automatic sub-agent creation path
 * during imports. It is a real stored value — the UI presents it as incomplete
 * rather than rewriting it.
 */
export const PLACEHOLDER_CONTACT = 'To be updated';

export function isPlaceholderContact(value: string | null | undefined): boolean {
  return (value ?? '').trim().toLowerCase() === PLACEHOLDER_CONTACT.toLowerCase();
}
