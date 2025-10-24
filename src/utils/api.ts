// Utility function to get the base static URL
export function getBaseStaticUrl(): string {
  return import.meta.env.VITE_BASE_STATIC_URL.replace("\\x3a", ":");
}
