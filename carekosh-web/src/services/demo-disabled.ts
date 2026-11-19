// Production/staging builds resolve every demo import here. No sample data ships.
export const demoUser = null;
export const demoRepository = null;
export function resetDemo(): never {
  throw new Error("Demo data is not available in this build.");
}
