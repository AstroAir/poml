import * as assert from 'assert';
import * as vscode from 'vscode';
import { OpenRouterService } from '../openrouter-service';

suite('OpenRouter Service Optimization Tests', () => {
  let service: OpenRouterService;

  setup(() => {
    // Reset the singleton instance
    (OpenRouterService as any).instance = undefined;
    service = OpenRouterService.getInstance();
  });

  teardown(() => {
    service.clearAuthenticationCache();
  });

  test('Service should be singleton', () => {
    const service1 = OpenRouterService.getInstance();
    const service2 = OpenRouterService.getInstance();
    assert.strictEqual(service1, service2, 'Service should be singleton');
  });

  test('Should clear cache when clearAuthenticationCache is called', () => {
    // Setup initial state
    (service as any).availableModels = [{ id: 'test' }];
    (service as any).authenticationStatus = 'authenticated';
    (service as any).lastAuthCheck = Date.now();

    // Clear cache
    service.clearAuthenticationCache();

    // Verify cache is cleared
    assert.deepStrictEqual((service as any).availableModels, []);
    assert.strictEqual((service as any).authenticationStatus, 'unknown');
    assert.strictEqual((service as any).lastAuthCheck, 0);
  });

  test('Should detect when cache is valid', () => {
    // Setup cached state
    (service as any).availableModels = [{ id: 'test-model' }];
    (service as any).authenticationStatus = 'authenticated';
    (service as any).lastAuthCheck = Date.now();

    // Mock settings to have all required values
    const originalGetSettings = service.getSettings;
    service.getSettings = () => ({
      apiKey: 'test-key',
      selectedModel: 'test-model',
      authenticationStatus: 'authenticated' as const
    });

    const canSkip = service.canSkipAuthenticationCheck();
    assert.strictEqual(canSkip, true);

    // Restore original method
    service.getSettings = originalGetSettings;
  });
});
