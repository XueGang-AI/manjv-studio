export async function withWorkerRetry<T>(fn: () => Promise<T>, maxRetries = 3, label = ''): Promise<T> {
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      if (attempt < maxRetries) {
        const delay = attempt * 2000
        console.warn(`[Retry] ${label} attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms: ${lastError.message}`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }
  throw lastError!
}
