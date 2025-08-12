import * as assert from 'assert';
import * as vscode from 'vscode';
import { VSCodeLLMService } from '../vscode-llm-service';

suite('VSCode LLM Service Tests', () => {
  let service: VSCodeLLMService;

  setup(() => {
    service = VSCodeLLMService.getInstance();
  });

  test('Service should be singleton', () => {
    const service1 = VSCodeLLMService.getInstance();
    const service2 = VSCodeLLMService.getInstance();
    assert.strictEqual(service1, service2, 'Service should be singleton');
  });

  test('Should detect API availability', () => {
    const isAvailable = service.isAvailable();
    // This will depend on the VSCode version running the test
    assert.strictEqual(typeof isAvailable, 'boolean', 'isAvailable should return boolean');
  });

  test('Should get settings from configuration', () => {
    const settings = service.getSettings();
    assert.strictEqual(typeof settings, 'object', 'Settings should be an object');
    assert.strictEqual(typeof settings.selectedModel, 'string', 'selectedModel should be string');
    assert.ok(['unknown', 'authenticated', 'unauthenticated'].includes(settings.authenticationStatus), 
      'authenticationStatus should be valid enum value');
  });

  test('Should handle model conversion correctly', () => {
    // Test the private method indirectly through the service
    const models = service.getAvailableModels();
    assert.ok(Array.isArray(models), 'Available models should be an array');
    
    // Each model should have required properties
    models.forEach(model => {
      assert.strictEqual(typeof model.id, 'string', 'Model id should be string');
      assert.strictEqual(typeof model.vendor, 'string', 'Model vendor should be string');
      assert.strictEqual(typeof model.name, 'string', 'Model name should be string');
    });
  });

  test('Should update selected model in settings', async () => {
    const testModelId = 'test-model-id';
    await service.updateSelectedModel(testModelId);
    
    // Verify the setting was updated
    const config = vscode.workspace.getConfiguration('poml');
    const selectedModel = config.get<string>('languageModel.vscode.selectedModel');
    assert.strictEqual(selectedModel, testModelId, 'Selected model should be updated in settings');
  });

  test('Should handle authentication status updates', async () => {
    // This is testing the private method indirectly
    const initialStatus = service.getAuthenticationStatus();
    assert.ok(['unknown', 'authenticated', 'unauthenticated'].includes(initialStatus), 
      'Initial status should be valid');
  });
});

suite('VSCode LLM Integration Tests', () => {
  test('Settings should include VSCode provider', () => {
    const config = vscode.workspace.getConfiguration('poml');
    const provider = config.get<string>('languageModel.provider');
    
    // Test that VSCode is a valid provider option
    const validProviders = ['openai', 'microsoft', 'anthropic', 'google', 'vscode'];
    if (provider) {
      assert.ok(validProviders.includes(provider), 'Provider should be valid');
    }
  });

  test('VSCode LLM settings should be accessible', () => {
    const config = vscode.workspace.getConfiguration('poml');
    
    // Test that VSCode LLM specific settings exist
    const selectedModel = config.get<string>('languageModel.vscode.selectedModel');
    const authStatus = config.get<string>('languageModel.vscode.authenticationStatus');
    
    assert.strictEqual(typeof selectedModel, 'string', 'selectedModel setting should exist');
    assert.strictEqual(typeof authStatus, 'string', 'authenticationStatus setting should exist');
  });
});

suite('Error Handling Tests', () => {
  test('Should handle missing VSCode LM API gracefully', () => {
    const service = VSCodeLLMService.getInstance();
    
    // Mock the API as unavailable
    const originalLm = (vscode as any).lm;
    (vscode as any).lm = undefined;
    
    try {
      const isAvailable = service.isAvailable();
      assert.strictEqual(isAvailable, false, 'Should detect API as unavailable');
    } finally {
      // Restore original API
      (vscode as any).lm = originalLm;
    }
  });

  test('Should handle authentication errors', async () => {
    const service = VSCodeLLMService.getInstance();
    
    if (!service.isAvailable()) {
      // Skip test if API is not available
      return;
    }

    const result = await service.checkAuthenticationAndDiscoverModels();
    
    // Result should have proper structure regardless of success/failure
    assert.strictEqual(typeof result.isAuthenticated, 'boolean', 'isAuthenticated should be boolean');
    assert.ok(Array.isArray(result.models), 'models should be array');
    
    if (!result.isAuthenticated) {
      assert.strictEqual(typeof result.error, 'string', 'error should be provided when not authenticated');
    }
  });
});
