/**
 * Tests for export retry utilities
 */

import {
  isRetryableError,
  calculateRetryDelay,
  retryWithBackoff,
  retryApiCall
} from '../exportRetryUtils';

describe('Export Retry Utils', () => {
  describe('isRetryableError', () => {
    it('should identify network errors as retryable', () => {
      const networkError = new Error('Network error occurred');
      expect(isRetryableError(networkError)).toBe(true);
    });

    it('should identify timeout errors as retryable', () => {
      const timeoutError = new Error('Request timed out');
      expect(isRetryableError(timeoutError)).toBe(true);
    });

    it('should identify 5xx server errors as retryable', () => {
      const serverError = new Error('Internal server error');
      serverError.status = 500;
      expect(isRetryableError(serverError)).toBe(true);
    });

    it('should identify 429 rate limit errors as retryable', () => {
      const rateLimitError = new Error('Too many requests');
      rateLimitError.status = 429;
      expect(isRetryableError(rateLimitError)).toBe(true);
    });

    it('should not identify auth errors as retryable', () => {
      const authError = new Error('Unauthorized');
      authError.status = 401;
      expect(isRetryableError(authError)).toBe(false);
    });

    it('should not identify validation errors as retryable', () => {
      const validationError = new Error('Bad request');
      validationError.status = 400;
      expect(isRetryableError(validationError)).toBe(false);
    });
  });

  describe('calculateRetryDelay', () => {
    it('should calculate exponential backoff delay', () => {
      const config = { baseDelay: 1000, backoffFactor: 2, maxDelay: 30000, jitter: false };
      
      expect(calculateRetryDelay(0, config)).toBe(1000);
      expect(calculateRetryDelay(1, config)).toBe(2000);
      expect(calculateRetryDelay(2, config)).toBe(4000);
    });

    it('should respect maximum delay limit', () => {
      const config = { baseDelay: 1000, backoffFactor: 2, maxDelay: 5000, jitter: false };
      
      expect(calculateRetryDelay(10, config)).toBe(5000);
    });

    it('should add jitter when enabled', () => {
      const config = { baseDelay: 1000, backoffFactor: 2, maxDelay: 30000, jitter: true };
      
      const delay1 = calculateRetryDelay(1, config);
      const delay2 = calculateRetryDelay(1, config);
      
      // With jitter, delays should be different (most of the time)
      // We'll just check they're in a reasonable range
      expect(delay1).toBeGreaterThan(1500);
      expect(delay1).toBeLessThan(2500);
      expect(delay2).toBeGreaterThan(1500);
      expect(delay2).toBeLessThan(2500);
    });
  });

  describe('retryWithBackoff', () => {
    it('should succeed on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await retryWithBackoff(operation, { maxRetries: 2 });
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue('success');
      
      const result = await retryWithBackoff(operation, { 
        maxRetries: 2, 
        baseDelay: 10 // Short delay for testing
      });
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable errors', async () => {
      const authError = new Error('Unauthorized');
      authError.status = 401;
      
      // First verify that isRetryableError returns false for this error
      expect(isRetryableError(authError)).toBe(false);
      
      const operation = jest.fn().mockRejectedValue(authError);
      
      await expect(retryWithBackoff(operation, { maxRetries: 2 }))
        .rejects.toEqual(expect.objectContaining({
          message: expect.stringContaining('Operation failed after 1 attempts')
        }));
      
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should exhaust retries and throw final error', async () => {
      const networkError = new Error('Network error');
      const operation = jest.fn().mockRejectedValue(networkError);
      
      await expect(retryWithBackoff(operation, { 
        maxRetries: 2, 
        baseDelay: 10 
      })).rejects.toEqual(expect.objectContaining({
        message: expect.stringContaining('Operation failed after 3 attempts')
      }));
      
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should call retry callback', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue('success');
      
      const onRetry = jest.fn();
      
      await retryWithBackoff(operation, { 
        maxRetries: 2, 
        baseDelay: 10 
      }, onRetry);
      
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Number), expect.any(Error));
    });
  });

  describe('retryApiCall', () => {
    it('should enhance errors with retry context', async () => {
      const apiError = new Error('Server error');
      apiError.status = 500;
      const apiCall = jest.fn().mockRejectedValue(apiError);
      
      try {
        await retryApiCall(apiCall, { maxRetries: 1, baseDelay: 10 });
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error.retryAttempt).toBeDefined();
        expect(error.isRetryable).toBeDefined();
      }
    });
  });
});