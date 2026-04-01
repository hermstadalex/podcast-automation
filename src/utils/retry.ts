import { logger } from './logger';

export async function withRetry<T>(
    operation: () => Promise<T>, 
    operationName: string,
    maxRetries = 3, 
    baseDelayMs = 2000
): Promise<T> {
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            return await operation();
        } catch (error: any) {
            attempt++;
            if (attempt >= maxRetries) {
                logger.error(`[${operationName}] Failed after ${maxRetries} attempts.`);
                throw error;
            }
            const delay = baseDelayMs * Math.pow(2, attempt - 1);
            logger.warn(`[${operationName}] Failed: ${error.message}. Retrying in ${delay}ms... (Attempt ${attempt}/${maxRetries-1})`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw new Error('Unreachable');
}
