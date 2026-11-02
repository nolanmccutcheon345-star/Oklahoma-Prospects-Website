/** Bound read-only public requests so a stalled connection always reaches recovery UI.
 * This does not cancel a server operation and must not wrap payment or other writes.
 */
export function publicRequest<T>(request: Promise<T>, timeoutMs = 12_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("The request took too long. Please try again.")),
      timeoutMs,
    );
    request.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
