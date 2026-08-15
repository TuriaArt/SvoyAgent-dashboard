/**
 * Fail-fast invariant check.
 * Бросает Error с префиксом [INVARIANT], если условие нарушено.
 * Используется для assert-пост-условий в production-коде.
 */
export function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    const err = new Error(`[INVARIANT] ${message}`);
    console.error(err.stack);
    throw err;
  }
}
