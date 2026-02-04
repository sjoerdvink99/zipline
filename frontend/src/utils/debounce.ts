export function debounce<TArgs extends unknown[], TReturn>(
  func: (...args: TArgs) => TReturn,
  wait: number,
): (...args: TArgs) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return (...args: TArgs) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => func(...args), wait);
  };
}
