import * as vscode from 'vscode';
import { Command } from '../util/commandManager';
import { OpenRouterService, OpenRouterModel } from '../openrouter-service';

/**
 * Command to check OpenRouter authentication and discover models
 */
export class CheckOpenRouterAuthCommand implements Command {
  public readonly id = 'poml.checkOpenRouterAuth';

  public async execute(): Promise<void> {
    const openRouterService = OpenRouterService.getInstance();

    // Check if API key is configured
    const settings = openRouterService.getSettings();
    if (!settings.apiKey) {
      const action = await vscode.window.showErrorMessage(
        'OpenRouter API key is not configured. Please set your API key in settings.',
        'Open Settings',
        'Get API Key',
        'Cancel'
      );

      switch (action) {
        case 'Open Settings':
          await vscode.commands.executeCommand('workbench.action.openSettings', 'poml.languageModel.openrouter.apiKey');
          break;
        case 'Get API Key':
          vscode.env.openExternal(vscode.Uri.parse('https://openrouter.ai/keys'));
          break;
      }
      return;
    }

    // Show progress while checking authentication
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Checking OpenRouter authentication...',
        cancellable: false
      },
      async (progress) => {
        progress.report({ increment: 50 });
        
        const result = await openRouterService.checkAuthenticationAndDiscoverModels();
        
        progress.report({ increment: 100 });

        if (result.isAuthenticated) {
          const modelCount = result.models.length;
          const message = `Successfully authenticated! Found ${modelCount} language model${modelCount !== 1 ? 's' : ''}.`;
          
          // Show success message with option to select model
          const action = await vscode.window.showInformationMessage(
            message,
            'Select Model',
            'OK'
          );

          if (action === 'Select Model') {
            await this.showModelSelectionQuickPick(result.models);
          }
        } else {
          // Show error message with helpful actions
          const action = await vscode.window.showErrorMessage(
            result.error || 'Authentication failed',
            'Open Settings',
            'Get API Key',
            'Retry'
          );

          switch (action) {
            case 'Open Settings':
              await vscode.commands.executeCommand('workbench.action.openSettings', 'poml.languageModel.openrouter.apiKey');
              break;
            case 'Get API Key':
              vscode.env.openExternal(vscode.Uri.parse('https://openrouter.ai/keys'));
              break;
            case 'Retry':
              await this.execute();
              break;
          }
        }
      }
    );
  }

  private async showModelSelectionQuickPick(models: OpenRouterModel[]): Promise<void> {
    const openRouterService = OpenRouterService.getInstance();
    const currentSettings = openRouterService.getSettings();

    const items = models.map(model => ({
      label: model.name,
      description: model.id,
      detail: this.getModelDetail(model),
      model: model
    }));

    // Mark currently selected model
    const currentModelIndex = items.findIndex(item => item.model.id === currentSettings.selectedModel);
    if (currentModelIndex >= 0) {
      items[currentModelIndex].label = `$(check) ${items[currentModelIndex].label}`;
    }

    const selected = await vscode.window.showQuickPick(items, {
      title: 'Select OpenRouter Language Model',
      placeHolder: 'Choose a language model to use with POML',
      ignoreFocusOut: true,
      matchOnDescription: true,
      matchOnDetail: true
    });

    if (selected) {
      await openRouterService.updateSelectedModel(selected.model.id);
      vscode.window.showInformationMessage(
        `Selected model: ${selected.model.name}`
      );
    }
  }

  private getModelDetail(model: OpenRouterModel): string {
    const details: string[] = [];
    
    if (model.context_length) {
      details.push(`Context: ${model.context_length.toLocaleString()}`);
    }
    
    if (model.pricing?.prompt && model.pricing?.completion) {
      const promptPrice = parseFloat(model.pricing.prompt) * 1000000; // Convert to per million tokens
      const completionPrice = parseFloat(model.pricing.completion) * 1000000;
      details.push(`$${promptPrice.toFixed(2)}/$${completionPrice.toFixed(2)} per 1M tokens`);
    }
    
    if (model.description) {
      details.push(model.description.substring(0, 100) + (model.description.length > 100 ? '...' : ''));
    }
    
    return details.join(' • ');
  }
}

/**
 * Command to select OpenRouter model
 */
export class SelectOpenRouterModelCommand implements Command {
  public readonly id = 'poml.selectOpenRouterModel';

  public async execute(): Promise<void> {
    const openRouterService = OpenRouterService.getInstance();

    const settings = openRouterService.getSettings();
    if (!settings.apiKey) {
      const action = await vscode.window.showWarningMessage(
        'OpenRouter API key is not configured. Please set your API key first.',
        'Open Settings',
        'Get API Key'
      );

      switch (action) {
        case 'Open Settings':
          await vscode.commands.executeCommand('workbench.action.openSettings', 'poml.languageModel.openrouter.apiKey');
          break;
        case 'Get API Key':
          vscode.env.openExternal(vscode.Uri.parse('https://openrouter.ai/keys'));
          break;
      }
      return;
    }

    const authStatus = openRouterService.getAuthenticationStatus();
    if (authStatus !== 'authenticated') {
      const action = await vscode.window.showWarningMessage(
        'You need to authenticate with OpenRouter first.',
        'Check Authentication',
        'Cancel'
      );

      if (action === 'Check Authentication') {
        await vscode.commands.executeCommand('poml.checkOpenRouterAuth');
      }
      return;
    }

    const models = openRouterService.getAvailableModels();
    if (models.length === 0) {
      vscode.window.showWarningMessage(
        'No OpenRouter models available. Please check your authentication.'
      );
      return;
    }

    const currentSettings = openRouterService.getSettings();
    const items = models.map(model => ({
      label: model.name,
      description: model.id,
      detail: this.getModelDetail(model),
      model: model
    }));

    // Mark currently selected model
    const currentModelIndex = items.findIndex(item => item.model.id === currentSettings.selectedModel);
    if (currentModelIndex >= 0) {
      items[currentModelIndex].label = `$(check) ${items[currentModelIndex].label}`;
    }

    const selected = await vscode.window.showQuickPick(items, {
      title: 'Select OpenRouter Language Model',
      placeHolder: 'Choose a language model to use with POML',
      ignoreFocusOut: true,
      matchOnDescription: true,
      matchOnDetail: true
    });

    if (selected) {
      await openRouterService.updateSelectedModel(selected.model.id);
      vscode.window.showInformationMessage(
        `Selected model: ${selected.model.name}`
      );
    }
  }

  private getModelDetail(model: OpenRouterModel): string {
    const details: string[] = [];
    
    if (model.context_length) {
      details.push(`Context: ${model.context_length.toLocaleString()}`);
    }
    
    if (model.pricing?.prompt && model.pricing?.completion) {
      const promptPrice = parseFloat(model.pricing.prompt) * 1000000;
      const completionPrice = parseFloat(model.pricing.completion) * 1000000;
      details.push(`$${promptPrice.toFixed(2)}/$${completionPrice.toFixed(2)} per 1M tokens`);
    }
    
    return details.join(' • ');
  }
}

/**
 * Command to show OpenRouter status
 */
export class ShowOpenRouterStatusCommand implements Command {
  public readonly id = 'poml.showOpenRouterStatus';

  public async execute(): Promise<void> {
    const openRouterService = OpenRouterService.getInstance();
    const settings = openRouterService.getSettings();
    const models = openRouterService.getAvailableModels();
    const authStatus = openRouterService.getAuthenticationStatus();

    let statusMessage = `Authentication: ${authStatus}\n`;
    statusMessage += `API Key: ${settings.apiKey ? 'Configured' : 'Not configured'}\n`;
    statusMessage += `Available models: ${models.length}\n`;
    
    if (settings.selectedModel) {
      const selectedModel = models.find(m => m.id === settings.selectedModel);
      statusMessage += `Selected model: ${selectedModel ? selectedModel.name : settings.selectedModel}`;
    } else {
      statusMessage += 'No model selected';
    }

    const actions: string[] = [];
    if (!settings.apiKey) {
      actions.push('Configure API Key');
    } else if (authStatus !== 'authenticated') {
      actions.push('Check Authentication');
    }
    if (authStatus === 'authenticated' && models.length > 0) {
      actions.push('Select Model');
    }
    actions.push('OK');

    const action = await vscode.window.showInformationMessage(
      statusMessage,
      ...actions
    );

    switch (action) {
      case 'Configure API Key':
        await vscode.commands.executeCommand('workbench.action.openSettings', 'poml.languageModel.openrouter.apiKey');
        break;
      case 'Check Authentication':
        await vscode.commands.executeCommand('poml.checkOpenRouterAuth');
        break;
      case 'Select Model':
        await vscode.commands.executeCommand('poml.selectOpenRouterModel');
        break;
    }
  }
}

/**
 * Command to configure OpenRouter with a guided wizard
 */
export class ConfigureOpenRouterCommand implements Command {
  public readonly id = 'poml.configureOpenRouter';

  public async execute(): Promise<void> {
    const openRouterService = OpenRouterService.getInstance();

    // First, do a quick setup check to see what's needed
    const setupCheck = await openRouterService.quickSetupCheck();

    if (setupCheck.isReady) {
      // Already configured and ready to use
      const message = setupCheck.skipAuthCheck
        ? 'OpenRouter is configured and ready! (Using cached authentication)'
        : 'OpenRouter is already configured and ready to use!';

      const action = await vscode.window.showInformationMessage(
        message,
        'Select Different Model',
        'Test Configuration',
        'OK'
      );

      switch (action) {
        case 'Select Different Model':
          await vscode.commands.executeCommand('poml.selectOpenRouterModel');
          break;
        case 'Test Configuration':
          await this.testConfiguration();
          break;
      }
      return;
    }

    // Show configuration wizard for missing steps only
    const steps: string[] = [];
    if (setupCheck.needsApiKey) {
      steps.push('Configure API Key');
    }
    if (setupCheck.needsAuthentication) {
      steps.push('Check Authentication');
    }
    if (setupCheck.needsModelSelection) {
      steps.push('Select Model');
    }
    steps.push('Test Configuration');

    let currentStep = 0;

    while (currentStep < steps.length) {
      const step = steps[currentStep];

      switch (step) {
        case 'Configure API Key':
          const apiKeyResult = await this.configureApiKey();
          if (!apiKeyResult.success) {
            if (apiKeyResult.retry) {
              continue; // Retry current step
            } else {
              return; // User cancelled
            }
          }
          break;

        case 'Check Authentication':
          const authResult = await this.checkAuthentication();
          if (!authResult.success) {
            if (authResult.retry) {
              continue; // Retry current step
            } else if (authResult.goBack) {
              currentStep = Math.max(0, currentStep - 1);
              continue;
            } else {
              return; // User cancelled
            }
          }
          break;

        case 'Select Model':
          const modelResult = await this.selectModel();
          if (!modelResult.success) {
            if (modelResult.goBack) {
              currentStep = Math.max(0, currentStep - 1);
              continue;
            } else {
              return; // User cancelled
            }
          }
          break;

        case 'Test Configuration':
          const testResult = await this.testConfiguration();
          if (!testResult.success) {
            if (testResult.goBack) {
              currentStep = Math.max(0, currentStep - 1);
              continue;
            } else {
              return; // User cancelled
            }
          }
          break;
      }

      currentStep++;
    }

    vscode.window.showInformationMessage(
      'OpenRouter configuration completed successfully!'
    );
  }

  private async configureApiKey(): Promise<{ success: boolean; retry?: boolean }> {
    const openRouterService = OpenRouterService.getInstance();
    const currentSettings = openRouterService.getSettings();

    if (currentSettings.apiKey) {
      const action = await vscode.window.showInformationMessage(
        'API key is already configured. Do you want to update it?',
        'Update',
        'Keep Current',
        'Cancel'
      );

      if (action === 'Keep Current') {
        return { success: true };
      } else if (action !== 'Update') {
        return { success: false };
      }
    }

    const action = await vscode.window.showInformationMessage(
      'You need an OpenRouter API key to continue. You can get one from openrouter.ai/keys',
      'Open Settings',
      'Get API Key',
      'I Have a Key',
      'Cancel'
    );

    switch (action) {
      case 'Open Settings':
        await vscode.commands.executeCommand('workbench.action.openSettings', 'poml.languageModel.openrouter.apiKey');
        return { success: false, retry: true };
      case 'Get API Key':
        vscode.env.openExternal(vscode.Uri.parse('https://openrouter.ai/keys'));
        return { success: false, retry: true };
      case 'I Have a Key':
        await vscode.commands.executeCommand('workbench.action.openSettings', 'poml.languageModel.openrouter.apiKey');
        return { success: false, retry: true };
      default:
        return { success: false };
    }
  }

  private async checkAuthentication(): Promise<{ success: boolean; retry?: boolean; goBack?: boolean }> {
    const openRouterService = OpenRouterService.getInstance();
    const result = await openRouterService.checkAuthenticationAndDiscoverModels(true); // Force refresh

    if (result.isAuthenticated) {
      return { success: true };
    } else {
      const action = await vscode.window.showErrorMessage(
        result.error || 'Authentication failed',
        'Retry',
        'Go Back',
        'Cancel'
      );

      switch (action) {
        case 'Retry':
          return { success: false, retry: true };
        case 'Go Back':
          return { success: false, goBack: true };
        default:
          return { success: false };
      }
    }
  }

  private async selectModel(): Promise<{ success: boolean; goBack?: boolean }> {
    const openRouterService = OpenRouterService.getInstance();
    const models = openRouterService.getAvailableModels();

    if (models.length === 0) {
      const action = await vscode.window.showWarningMessage(
        'No OpenRouter models available.',
        'Go Back',
        'Cancel'
      );
      return { success: false, goBack: action === 'Go Back' };
    }

    const currentSettings = openRouterService.getSettings();
    const items = models.slice(0, 50).map(model => ({ // Limit to first 50 models for performance
      label: model.name,
      description: model.id,
      detail: this.getModelDetail(model),
      model: model
    }));

    // Mark currently selected model
    const currentModelIndex = items.findIndex(item => item.model.id === currentSettings.selectedModel);
    if (currentModelIndex >= 0) {
      items[currentModelIndex].label = `$(check) ${items[currentModelIndex].label}`;
    }

    const selected = await vscode.window.showQuickPick(items, {
      title: 'Select OpenRouter Language Model',
      placeHolder: 'Choose a language model to use with POML',
      ignoreFocusOut: true,
      matchOnDescription: true
    });

    if (!selected) {
      return { success: false };
    }

    await openRouterService.updateSelectedModel(selected.model.id);
    return { success: true };
  }

  private async testConfiguration(): Promise<{ success: boolean; goBack?: boolean }> {
    const config = vscode.workspace.getConfiguration('poml');
    await config.update('languageModel.provider', 'openrouter', vscode.ConfigurationTarget.Global);

    const action = await vscode.window.showInformationMessage(
      'OpenRouter provider has been set. You can now test your prompts using OpenRouter models.',
      'Test Now',
      'Finish'
    );

    if (action === 'Test Now') {
      // Try to run a test if there's an active POML file
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor && activeEditor.document.languageId === 'poml') {
        await vscode.commands.executeCommand('poml.test');
      } else {
        vscode.window.showInformationMessage(
          'Open a POML file and use the "Test current prompt on Chat Models" command to test your configuration.'
        );
      }
    }

    return { success: true };
  }

  private getModelDetail(model: OpenRouterModel): string {
    const details: string[] = [];

    if (model.context_length) {
      details.push(`Context: ${model.context_length.toLocaleString()}`);
    }

    if (model.pricing?.prompt && model.pricing?.completion) {
      const promptPrice = parseFloat(model.pricing.prompt) * 1000000;
      const completionPrice = parseFloat(model.pricing.completion) * 1000000;
      details.push(`$${promptPrice.toFixed(2)}/$${completionPrice.toFixed(2)} per 1M tokens`);
    }

    return details.join(' • ');
  }
}

/**
 * Command for quick OpenRouter setup - automatically detects what's needed
 * Optimized to avoid unnecessary re-authentication when API key and model are already configured
 */
export class QuickSetupOpenRouterCommand implements Command {
  public readonly id = 'poml.quickSetupOpenRouter';

  public async execute(): Promise<void> {
    const openRouterService = OpenRouterService.getInstance();

    // Check current setup status with optimized logic
    const setupCheck = await openRouterService.quickSetupCheck();

    if (setupCheck.isReady) {
      // If skipAuthCheck is true, we avoided unnecessary authentication
      const message = setupCheck.skipAuthCheck
        ? 'OpenRouter is ready to use! (Using cached authentication) 🎉'
        : 'OpenRouter is already configured and ready to use! 🎉';

      vscode.window.showInformationMessage(message);
      return;
    }

    // Guide user through minimal required steps
    if (setupCheck.needsApiKey) {
      const action = await vscode.window.showInformationMessage(
        'OpenRouter API key is required to get started.',
        'Get API Key & Configure',
        'I Have a Key',
        'Cancel'
      );

      switch (action) {
        case 'Get API Key & Configure':
          vscode.env.openExternal(vscode.Uri.parse('https://openrouter.ai/keys'));
          await vscode.commands.executeCommand('workbench.action.openSettings', 'poml.languageModel.openrouter.apiKey');
          return;
        case 'I Have a Key':
          await vscode.commands.executeCommand('workbench.action.openSettings', 'poml.languageModel.openrouter.apiKey');
          return;
        default:
          return;
      }
    }

    // Only perform authentication check if really needed (not skipped by optimization)
    if (setupCheck.needsAuthentication && !setupCheck.skipAuthCheck) {
      const result = await openRouterService.checkAuthenticationAndDiscoverModels(true);
      if (!result.isAuthenticated) {
        vscode.window.showErrorMessage(
          result.error || 'Authentication failed. Please check your API key.',
          'Open Settings'
        ).then(action => {
          if (action === 'Open Settings') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'poml.languageModel.openrouter.apiKey');
          }
        });
        return;
      }
    }

    if (setupCheck.needsModelSelection) {
      const models = openRouterService.getAvailableModels();
      if (models.length === 0) {
        // If no models cached, try to fetch them
        const result = await openRouterService.checkAuthenticationAndDiscoverModels(false);
        if (!result.isAuthenticated || result.models.length === 0) {
          vscode.window.showErrorMessage('No models available. Please check your authentication.');
          return;
        }
      }

      await vscode.commands.executeCommand('poml.selectOpenRouterModel');
      return;
    }

    // If we get here, everything should be ready
    vscode.window.showInformationMessage(
      'OpenRouter setup completed successfully! 🎉'
    );
  }
}
