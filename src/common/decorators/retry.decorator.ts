export function Retryable(options: { maxAttempts?: number; delay?: number; backoff?: 'exponential' } = {}) {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelay = options.delay ?? 1000;
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      let lastError: Error;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await originalMethod.apply(this, args);
        } catch (err) {
          lastError = err;
          if (attempt < maxAttempts) {
            const delay = options.backoff === 'exponential' ? baseDelay * Math.pow(2, attempt - 1) : baseDelay;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      throw lastError;
    };
    return descriptor;
  };
}
