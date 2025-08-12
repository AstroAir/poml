import * as vscode from 'vscode';
import { Message, RichContent } from 'poml';

export interface VSCodeLLMModel {
  id: string;
  vendor: string;
  family?: string;
  version?: string;
  name: string;
  maxInputTokens?: number;
}

export interface VSCodeLLMSettings {
  selectedModel: string;
  authenticationStatus: 'unknown' | 'authenticated' | 'unauthenticated';
}

export class VSCodeLLMService {
  private static instance: VSCodeLLMService;
  private availableModels: VSCodeLLMModel[] = [];
  private authenticationStatus: 'unknown' | 'authenticated' | 'unauthenticated' = 'unknown';

  private constructor() {}

  public static getInstance(): VSCodeLLMService {
    if (!VSCodeLLMService.instance) {
      VSCodeLLMService.instance = new VSCodeLLMService();
    }
    return VSCodeLLMService.instance;
  }

  /**
   * Check if VSCode Language Model API is available
   */
  public isAvailable(): boolean {
    return typeof vscode.lm !== 'undefined' && typeof vscode.lm.selectChatModels === 'function';
  }

  /**
   * Check authentication status and discover available models
   */
  public async checkAuthenticationAndDiscoverModels(): Promise<{
    isAuthenticated: boolean;
    models: VSCodeLLMModel[];
    error?: string;
  }> {
    if (!this.isAvailable()) {
      return {
        isAuthenticated: false,
        models: [],
        error: 'VSCode Language Model API is not available'
      };
    }

    try {
      // Try to get all available models
      const models = await vscode.lm.selectChatModels({});
      
      if (models.length === 0) {
        this.authenticationStatus = 'unauthenticated';
        this.availableModels = [];
        return {
          isAuthenticated: false,
          models: [],
          error: 'No language models available. Please authenticate with a language model provider (e.g., GitHub Copilot).'
        };
      }

      // Convert VSCode models to our interface
      this.availableModels = models.map(model => ({
        id: model.id,
        vendor: model.vendor,
        family: model.family,
        version: model.version,
        name: this.getModelDisplayName(model),
        maxInputTokens: model.maxInputTokens
      }));

      this.authenticationStatus = 'authenticated';
      
      // Update settings
      await this.updateAuthenticationStatus('authenticated');

      return {
        isAuthenticated: true,
        models: this.availableModels
      };
    } catch (error) {
      this.authenticationStatus = 'unauthenticated';
      this.availableModels = [];
      
      // Update settings
      await this.updateAuthenticationStatus('unauthenticated');

      let errorMessage = 'Failed to access language models';
      if (error instanceof vscode.LanguageModelError) {
        // Handle different types of LanguageModelError
        if (error instanceof vscode.LanguageModelError.NoPermissions) {
          errorMessage = 'No permission to access language models. Please authenticate with a language model provider.';
        } else if (error instanceof vscode.LanguageModelError.Blocked) {
          errorMessage = 'Access to language models is blocked.';
        } else {
          errorMessage = `Language model error: ${error.message}`;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      return {
        isAuthenticated: false,
        models: [],
        error: errorMessage
      };
    }
  }

  /**
   * Get available models (cached)
   */
  public getAvailableModels(): VSCodeLLMModel[] {
    return [...this.availableModels];
  }

  /**
   * Get current authentication status
   */
  public getAuthenticationStatus(): 'unknown' | 'authenticated' | 'unauthenticated' {
    return this.authenticationStatus;
  }

  /**
   * Send a request to a VSCode language model
   */
  public async sendRequest(
    messages: Message[],
    modelId?: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
    },
    cancellationToken?: vscode.CancellationToken
  ): Promise<AsyncIterable<string>> {
    if (!this.isAvailable()) {
      throw new Error('VSCode Language Model API is not available');
    }

    // Get the model to use
    let selectedModel: vscode.LanguageModelChatModel | undefined;
    
    if (modelId) {
      // Try to find the specific model
      const models = await vscode.lm.selectChatModels({});
      selectedModel = models.find(m => m.id === modelId);
      if (!selectedModel) {
        throw new Error(`Model with ID "${modelId}" not found`);
      }
    } else {
      // Use the first available model
      const models = await vscode.lm.selectChatModels({});
      if (models.length === 0) {
        throw new Error('No language models available');
      }
      selectedModel = models[0];
    }

    // Convert POML messages to VSCode language model messages
    const vscodeMessages = this.convertToVSCodeMessages(messages);

    // Send the request
    const response = await selectedModel.sendRequest(
      vscodeMessages,
      options || {},
      cancellationToken || new vscode.CancellationTokenSource().token
    );

    return response.text;
  }

  /**
   * Convert POML messages to VSCode LanguageModelChatMessage format
   */
  private convertToVSCodeMessages(messages: Message[]): vscode.LanguageModelChatMessage[] {
    return messages.map(message => {
      const content = typeof message.content === 'string' 
        ? message.content 
        : JSON.stringify(message.content);
      
      switch (message.speaker) {
        case 'human':
        case 'user':
          return vscode.LanguageModelChatMessage.User(content);
        case 'assistant':
        case 'ai':
          return vscode.LanguageModelChatMessage.Assistant(content);
        default:
          // Default to user message for unknown speakers
          return vscode.LanguageModelChatMessage.User(content);
      }
    });
  }

  /**
   * Get a display name for a model
   */
  private getModelDisplayName(model: vscode.LanguageModelChatModel): string {
    if (model.family && model.version) {
      return `${model.vendor} ${model.family} ${model.version}`;
    } else if (model.family) {
      return `${model.vendor} ${model.family}`;
    } else {
      return `${model.vendor} ${model.id}`;
    }
  }

  /**
   * Update authentication status in settings
   */
  private async updateAuthenticationStatus(status: 'authenticated' | 'unauthenticated'): Promise<void> {
    const config = vscode.workspace.getConfiguration('poml');
    await config.update('languageModel.vscode.authenticationStatus', status, vscode.ConfigurationTarget.Global);
  }

  /**
   * Get VSCode LLM settings from configuration
   */
  public getSettings(): VSCodeLLMSettings {
    const config = vscode.workspace.getConfiguration('poml');
    return {
      selectedModel: config.get<string>('languageModel.vscode.selectedModel', ''),
      authenticationStatus: config.get<'unknown' | 'authenticated' | 'unauthenticated'>(
        'languageModel.vscode.authenticationStatus', 
        'unknown'
      )
    };
  }

  /**
   * Update selected model in settings
   */
  public async updateSelectedModel(modelId: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('poml');
    await config.update('languageModel.vscode.selectedModel', modelId, vscode.ConfigurationTarget.Global);
  }
}
