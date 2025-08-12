import * as vscode from 'vscode';
import { Command } from '../util/commandManager';
import { VSCodeLLMService, VSCodeLLMModel } from '../vscode-llm-service';

/**
 * Command to check VSCode LLM authentication and discover models
 */
export class CheckVSCodeLLMAuthCommand implements Command {
  public readonly id = 'poml.checkVSCodeLLMAuth';

  public async execute(): Promise<void> {
    const llmService = VSCodeLLMService.getInstance();

    if (!llmService.isAvailable()) {
      vscode.window.showErrorMessage(
        'VSCode Language Model API is not available. Please update to a newer version of VSCode (1.90+).'
      );
      return;
    }

    // Show progress while checking authentication
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Checking VSCode Language Model authentication...',
        cancellable: false
      },
      async (progress) => {
        progress.report({ increment: 50 });
        
        const result = await llmService.checkAuthenticationAndDiscoverModels();
        
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
          // Show error message with authentication guidance
          const action = await vscode.window.showErrorMessage(
            result.error || 'Authentication failed',
            'Learn More',
            'Retry'
          );

          if (action === 'Learn More') {
            vscode.env.openExternal(vscode.Uri.parse(
              'https://code.visualstudio.com/docs/copilot/copilot-extensibility'
            ));
          } else if (action === 'Retry') {
            await this.execute();
          }
        }
      }
    );
  }

  private async showModelSelectionQuickPick(models: VSCodeLLMModel[]): Promise<void> {
    const llmService = VSCodeLLMService.getInstance();
    const currentSettings = llmService.getSettings();

    const items = models.map(model => ({
      label: model.name,
      description: `${model.vendor} • ${model.id}`,
      detail: model.maxInputTokens ? `Max tokens: ${model.maxInputTokens.toLocaleString()}` : undefined,
      model: model
    }));

    // Mark currently selected model
    const currentModelIndex = items.findIndex(item => item.model.id === currentSettings.selectedModel);
    if (currentModelIndex >= 0) {
      items[currentModelIndex].label = `$(check) ${items[currentModelIndex].label}`;
    }

    const selected = await vscode.window.showQuickPick(items, {
      title: 'Select VSCode Language Model',
      placeHolder: 'Choose a language model to use with POML',
      ignoreFocusOut: true
    });

    if (selected) {
      await llmService.updateSelectedModel(selected.model.id);
      vscode.window.showInformationMessage(
        `Selected model: ${selected.model.name}`
      );
    }
  }
}

/**
 * Command to select VSCode LLM model
 */
export class SelectVSCodeLLMModelCommand implements Command {
  public readonly id = 'poml.selectVSCodeLLMModel';

  public async execute(): Promise<void> {
    const llmService = VSCodeLLMService.getInstance();

    if (!llmService.isAvailable()) {
      vscode.window.showErrorMessage(
        'VSCode Language Model API is not available. Please update to a newer version of VSCode (1.90+).'
      );
      return;
    }

    const authStatus = llmService.getAuthenticationStatus();
    if (authStatus !== 'authenticated') {
      const action = await vscode.window.showWarningMessage(
        'You need to authenticate with a language model provider first.',
        'Check Authentication',
        'Cancel'
      );

      if (action === 'Check Authentication') {
        await vscode.commands.executeCommand('poml.checkVSCodeLLMAuth');
      }
      return;
    }

    const models = llmService.getAvailableModels();
    if (models.length === 0) {
      vscode.window.showWarningMessage(
        'No language models available. Please check your authentication.'
      );
      return;
    }

    const currentSettings = llmService.getSettings();
    const items = models.map(model => ({
      label: model.name,
      description: `${model.vendor} • ${model.id}`,
      detail: model.maxInputTokens ? `Max tokens: ${model.maxInputTokens.toLocaleString()}` : undefined,
      model: model
    }));

    // Mark currently selected model
    const currentModelIndex = items.findIndex(item => item.model.id === currentSettings.selectedModel);
    if (currentModelIndex >= 0) {
      items[currentModelIndex].label = `$(check) ${items[currentModelIndex].label}`;
    }

    const selected = await vscode.window.showQuickPick(items, {
      title: 'Select VSCode Language Model',
      placeHolder: 'Choose a language model to use with POML',
      ignoreFocusOut: true
    });

    if (selected) {
      await llmService.updateSelectedModel(selected.model.id);
      vscode.window.showInformationMessage(
        `Selected model: ${selected.model.name}`
      );
    }
  }
}

/**
 * Command to show VSCode LLM status
 */
export class ShowVSCodeLLMStatusCommand implements Command {
  public readonly id = 'poml.showVSCodeLLMStatus';

  public async execute(): Promise<void> {
    const llmService = VSCodeLLMService.getInstance();

    if (!llmService.isAvailable()) {
      vscode.window.showInformationMessage(
        'VSCode Language Model API is not available. Please update to a newer version of VSCode (1.90+).'
      );
      return;
    }

    const settings = llmService.getSettings();
    const models = llmService.getAvailableModels();
    const authStatus = llmService.getAuthenticationStatus();

    let statusMessage = `Authentication: ${authStatus}\n`;
    statusMessage += `Available models: ${models.length}\n`;
    
    if (settings.selectedModel) {
      const selectedModel = models.find(m => m.id === settings.selectedModel);
      statusMessage += `Selected model: ${selectedModel ? selectedModel.name : settings.selectedModel}`;
    } else {
      statusMessage += 'No model selected';
    }

    const actions: string[] = [];
    if (authStatus !== 'authenticated') {
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
      case 'Check Authentication':
        await vscode.commands.executeCommand('poml.checkVSCodeLLMAuth');
        break;
      case 'Select Model':
        await vscode.commands.executeCommand('poml.selectVSCodeLLMModel');
        break;
    }
  }
}

/**
 * Command to configure VSCode LLM settings with a guided wizard
 */
export class ConfigureVSCodeLLMCommand implements Command {
  public readonly id = 'poml.configureVSCodeLLM';

  public async execute(): Promise<void> {
    const llmService = VSCodeLLMService.getInstance();

    if (!llmService.isAvailable()) {
      vscode.window.showErrorMessage(
        'VSCode Language Model API is not available. Please update to a newer version of VSCode (1.90+).'
      );
      return;
    }

    // Show configuration wizard
    const steps = [
      'Check Authentication',
      'Select Model',
      'Test Configuration'
    ];

    let currentStep = 0;

    while (currentStep < steps.length) {
      const step = steps[currentStep];

      switch (step) {
        case 'Check Authentication':
          const authResult = await this.checkAuthentication();
          if (!authResult.success) {
            if (authResult.retry) {
              continue; // Retry current step
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
      'VSCode Language Model configuration completed successfully!'
    );
  }

  private async checkAuthentication(): Promise<{ success: boolean; retry?: boolean }> {
    const llmService = VSCodeLLMService.getInstance();
    const result = await llmService.checkAuthenticationAndDiscoverModels();

    if (result.isAuthenticated) {
      return { success: true };
    } else {
      const action = await vscode.window.showErrorMessage(
        result.error || 'Authentication failed',
        'Retry',
        'Learn More',
        'Cancel'
      );

      switch (action) {
        case 'Retry':
          return { success: false, retry: true };
        case 'Learn More':
          vscode.env.openExternal(vscode.Uri.parse(
            'https://code.visualstudio.com/docs/copilot/copilot-extensibility'
          ));
          return { success: false, retry: true };
        default:
          return { success: false };
      }
    }
  }

  private async selectModel(): Promise<{ success: boolean; goBack?: boolean }> {
    const llmService = VSCodeLLMService.getInstance();
    const models = llmService.getAvailableModels();

    if (models.length === 0) {
      const action = await vscode.window.showWarningMessage(
        'No language models available.',
        'Go Back',
        'Cancel'
      );
      return { success: false, goBack: action === 'Go Back' };
    }

    const currentSettings = llmService.getSettings();
    const items = models.map(model => ({
      label: model.name,
      description: `${model.vendor} • ${model.id}`,
      detail: model.maxInputTokens ? `Max tokens: ${model.maxInputTokens.toLocaleString()}` : undefined,
      model: model
    }));

    // Mark currently selected model
    const currentModelIndex = items.findIndex(item => item.model.id === currentSettings.selectedModel);
    if (currentModelIndex >= 0) {
      items[currentModelIndex].label = `$(check) ${items[currentModelIndex].label}`;
    }

    const selected = await vscode.window.showQuickPick(items, {
      title: 'Select VSCode Language Model',
      placeHolder: 'Choose a language model to use with POML',
      ignoreFocusOut: true
    });

    if (!selected) {
      return { success: false };
    }

    await llmService.updateSelectedModel(selected.model.id);
    return { success: true };
  }

  private async testConfiguration(): Promise<{ success: boolean; goBack?: boolean }> {
    const config = vscode.workspace.getConfiguration('poml');
    await config.update('languageModel.provider', 'vscode', vscode.ConfigurationTarget.Global);

    const action = await vscode.window.showInformationMessage(
      'VSCode Language Model provider has been set. You can now test your prompts using the VSCode language models.',
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
}
