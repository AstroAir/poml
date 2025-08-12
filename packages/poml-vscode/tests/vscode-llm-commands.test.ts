import * as assert from 'assert';
import * as vscode from 'vscode';
import { 
  CheckVSCodeLLMAuthCommand, 
  SelectVSCodeLLMModelCommand, 
  ShowVSCodeLLMStatusCommand,
  ConfigureVSCodeLLMCommand 
} from '../command/vscodeLLMCommand';
import { Settings } from '../settings';

suite('VSCode LLM Commands Tests', () => {
  test('CheckVSCodeLLMAuthCommand should have correct ID', () => {
    const command = new CheckVSCodeLLMAuthCommand();
    assert.strictEqual(command.id, 'poml.checkVSCodeLLMAuth', 'Command should have correct ID');
  });

  test('SelectVSCodeLLMModelCommand should have correct ID', () => {
    const command = new SelectVSCodeLLMModelCommand();
    assert.strictEqual(command.id, 'poml.selectVSCodeLLMModel', 'Command should have correct ID');
  });

  test('ShowVSCodeLLMStatusCommand should have correct ID', () => {
    const command = new ShowVSCodeLLMStatusCommand();
    assert.strictEqual(command.id, 'poml.showVSCodeLLMStatus', 'Command should have correct ID');
  });

  test('ConfigureVSCodeLLMCommand should have correct ID', () => {
    const command = new ConfigureVSCodeLLMCommand();
    assert.strictEqual(command.id, 'poml.configureVSCodeLLM', 'Command should have correct ID');
  });

  test('Commands should be registered in VSCode', async () => {
    const commands = await vscode.commands.getCommands();
    
    const expectedCommands = [
      'poml.checkVSCodeLLMAuth',
      'poml.selectVSCodeLLMModel', 
      'poml.showVSCodeLLMStatus',
      'poml.configureVSCodeLLM'
    ];

    expectedCommands.forEach(commandId => {
      assert.ok(commands.includes(commandId), `Command ${commandId} should be registered`);
    });
  });
});

suite('Settings Integration Tests', () => {
  test('VSCode provider should be available in settings', () => {
    const config = vscode.workspace.getConfiguration('poml');
    const inspect = config.inspect('languageModel.provider');
    
    // Check that the setting exists and has VSCode as an option
    assert.ok(inspect, 'languageModel.provider setting should exist');
    
    // The enum values should include 'vscode'
    // Note: We can't directly test the enum values from the configuration,
    // but we can test that setting 'vscode' as the value works
    const originalValue = config.get('languageModel.provider');
    
    // Test setting VSCode provider
    config.update('languageModel.provider', 'vscode', vscode.ConfigurationTarget.Global)
      .then(() => {
        const newValue = config.get('languageModel.provider');
        assert.strictEqual(newValue, 'vscode', 'Should be able to set VSCode provider');
        
        // Restore original value
        return config.update('languageModel.provider', originalValue, vscode.ConfigurationTarget.Global);
      });
  });

  test('VSCode LLM specific settings should exist', () => {
    const config = vscode.workspace.getConfiguration('poml');
    
    // Test that all VSCode LLM settings are accessible
    const selectedModelInspect = config.inspect('languageModel.vscode.selectedModel');
    const authStatusInspect = config.inspect('languageModel.vscode.authenticationStatus');
    
    assert.ok(selectedModelInspect, 'selectedModel setting should exist');
    assert.ok(authStatusInspect, 'authenticationStatus setting should exist');
  });
});

suite('Settings Class Integration Tests', () => {
  test('Settings class should handle VSCode provider', () => {
    // Create a mock URI for testing
    const testUri = vscode.Uri.file('/test/file.poml');
    
    const settings = Settings.getForResource(testUri);
    
    // Test that the settings object has the expected structure
    assert.ok(settings.languageModel, 'Settings should have languageModel property');
    assert.ok(typeof settings.languageModel.provider === 'string', 'Provider should be string');
    
    // Test VSCode-specific properties
    if (settings.languageModel.vscode) {
      assert.ok(typeof settings.languageModel.vscode.selectedModel === 'string' || 
                settings.languageModel.vscode.selectedModel === undefined, 
                'selectedModel should be string or undefined');
  const authStatus = settings.languageModel.vscode.authenticationStatus ?? 'unknown';
  assert.ok(['unknown', 'authenticated', 'unauthenticated'].includes(authStatus), 
        'authenticationStatus should be valid enum value');
    }
  });

  test('Settings helper methods should work correctly', () => {
    const testUri = vscode.Uri.file('/test/file.poml');
    
    // Test with VSCode provider
    const config = vscode.workspace.getConfiguration('poml');
    const originalProvider = config.get('languageModel.provider');
    
    config.update('languageModel.provider', 'vscode', vscode.ConfigurationTarget.Global)
      .then(() => {
        const settings = Settings.getForResource(testUri);
        
        // Test helper methods
        const isVSCodeConfigured = settings.isVSCodeLLMConfigured();
        const requiresExternalAPI = settings.requiresExternalAPIConfig();
        
        assert.strictEqual(typeof isVSCodeConfigured, 'boolean', 'isVSCodeLLMConfigured should return boolean');
        assert.strictEqual(requiresExternalAPI, false, 'VSCode provider should not require external API config');
        
        // Restore original provider
        return config.update('languageModel.provider', originalProvider, vscode.ConfigurationTarget.Global);
      });
  });
});
