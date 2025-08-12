import * as vscode from 'vscode';
import { Message } from 'poml';

export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
  top_provider?: {
    context_length: number;
    max_completion_tokens?: number;
    is_moderated: boolean;
  };
  architecture?: {
    modality: string;
    tokenizer: string;
    instruct_type?: string;
  };
}

export interface OpenRouterSettings {
  selectedModel: string;
  authenticationStatus: 'unknown' | 'authenticated' | 'unauthenticated';
  apiKey: string;
}

export interface OpenRouterResponse {
  id: string;
  choices: Array<{
    finish_reason: string | null;
    message?: {
      role: string;
      content: string | null;
    };
    delta?: {
      content: string | null;
      role?: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
}

export class OpenRouterService {
  private static instance: OpenRouterService;
  private availableModels: OpenRouterModel[] = [];
  private authenticationStatus: 'unknown' | 'authenticated' | 'unauthenticated' = 'unknown';
  private readonly baseUrl = 'https://openrouter.ai/api/v1';
  private lastAuthCheck: number = 0;
  private readonly AUTH_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

  private constructor() {}

  public static getInstance(): OpenRouterService {
    if (!OpenRouterService.instance) {
      OpenRouterService.instance = new OpenRouterService();
    }
    return OpenRouterService.instance;
  }

  /**
   * Check authentication status and discover available models
   *
   * OPTIMIZATION: This method implements intelligent caching to avoid unnecessary
   * re-authentication when the user already has a valid API key and selected model.
   *
   * - Uses a 5-minute cache for authentication status
   * - Skips API calls when authentication is already established
   * - Only forces re-authentication when explicitly requested or cache expires
   *
   * This significantly improves the user experience by eliminating redundant
   * authentication prompts when switching between models or restarting VSCode.
   */
  public async checkAuthenticationAndDiscoverModels(forceRefresh: boolean = false): Promise<{
    isAuthenticated: boolean;
    models: OpenRouterModel[];
    error?: string;
  }> {
    const settings = this.getSettings();

    if (!settings.apiKey) {
      this.authenticationStatus = 'unauthenticated';
      await this.updateAuthenticationStatus('unauthenticated');
      return {
        isAuthenticated: false,
        models: [],
        error: 'No API key provided. Please set your OpenRouter API key in settings.'
      };
    }

    // Check if we can use cached authentication (within cache duration)
    const now = Date.now();
    const isCacheValid = (now - this.lastAuthCheck) < this.AUTH_CACHE_DURATION;

    // If already authenticated and models are cached, return cached data unless forced refresh
    // This optimization avoids unnecessary API calls when authentication is already established
    if (!forceRefresh &&
        isCacheValid &&
        this.authenticationStatus === 'authenticated' &&
        this.availableModels.length > 0 &&
        settings.authenticationStatus === 'authenticated') {
      return {
        isAuthenticated: true,
        models: this.availableModels
      };
    }

    // If we have authentication status as 'authenticated' but no cached models,
    // and this is not a forced refresh and cache is valid, try to use the cached status
    if (!forceRefresh &&
        isCacheValid &&
        settings.authenticationStatus === 'authenticated' &&
        this.availableModels.length === 0) {
      // Set our internal status to match settings to avoid redundant checks
      this.authenticationStatus = 'authenticated';
    }

    try {
      // Test authentication by fetching models
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${settings.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://vscode.dev', // For OpenRouter rankings
          'X-Title': 'POML VSCode Extension'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Authentication failed';
        
        if (response.status === 401) {
          errorMessage = 'Invalid API key. Please check your OpenRouter API key.';
        } else if (response.status === 403) {
          errorMessage = 'Access forbidden. Please check your OpenRouter account status.';
        } else {
          errorMessage = `API error (${response.status}): ${errorText}`;
        }

        this.authenticationStatus = 'unauthenticated';
        await this.updateAuthenticationStatus('unauthenticated');
        
        return {
          isAuthenticated: false,
          models: [],
          error: errorMessage
        };
      }

      const data = await response.json();
      
      if (!data.data || !Array.isArray(data.data)) {
        throw new Error('Invalid response format from OpenRouter API');
      }

      // Convert API response to our model interface
      this.availableModels = data.data.map((model: any) => ({
        id: model.id,
        name: model.name || model.id,
        description: model.description,
        context_length: model.context_length || 0,
        pricing: {
          prompt: model.pricing?.prompt || '0',
          completion: model.pricing?.completion || '0'
        },
        top_provider: model.top_provider,
        architecture: model.architecture
      }));

      this.authenticationStatus = 'authenticated';
      this.lastAuthCheck = Date.now(); // Update cache timestamp
      await this.updateAuthenticationStatus('authenticated');

      return {
        isAuthenticated: true,
        models: this.availableModels
      };
    } catch (error) {
      this.authenticationStatus = 'unauthenticated';
      await this.updateAuthenticationStatus('unauthenticated');

      let errorMessage = 'Failed to connect to OpenRouter API';
      if (error instanceof Error) {
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
  public getAvailableModels(): OpenRouterModel[] {
    return [...this.availableModels];
  }

  /**
   * Get current authentication status
   */
  public getAuthenticationStatus(): 'unknown' | 'authenticated' | 'unauthenticated' {
    return this.authenticationStatus;
  }

  /**
   * Check if the service is ready to use (has API key and selected model)
   */
  public isReadyToUse(): boolean {
    const settings = this.getSettings();
    return !!(settings.apiKey && settings.selectedModel && settings.authenticationStatus === 'authenticated');
  }

  /**
   * Check if we can skip authentication check based on current state
   * This helps optimize the setup process when user already has everything configured
   */
  public canSkipAuthenticationCheck(): boolean {
    const settings = this.getSettings();
    const now = Date.now();
    const isCacheValid = (now - this.lastAuthCheck) < this.AUTH_CACHE_DURATION;

    return !!(
      settings.apiKey &&
      settings.selectedModel &&
      settings.authenticationStatus === 'authenticated' &&
      this.availableModels.length > 0 &&
      isCacheValid
    );
  }

  /**
   * Clear authentication cache - useful when API key changes or authentication fails
   */
  public clearAuthenticationCache(): void {
    this.lastAuthCheck = 0;
    this.authenticationStatus = 'unknown';
    this.availableModels = [];
  }

  /**
   * Quick setup check - returns true if already configured and authenticated
   * Optimized to avoid unnecessary re-authentication when API key and model are already set
   */
  public async quickSetupCheck(): Promise<{
    isReady: boolean;
    needsApiKey: boolean;
    needsAuthentication: boolean;
    needsModelSelection: boolean;
    skipAuthCheck?: boolean;
  }> {
    const settings = this.getSettings();

    const needsApiKey = !settings.apiKey;
    const needsModelSelection = !settings.selectedModel;

    // If no API key, definitely need authentication
    if (needsApiKey) {
      return {
        isReady: false,
        needsApiKey: true,
        needsAuthentication: true,
        needsModelSelection: true
      };
    }

    // If we have both API key and selected model, and auth status is authenticated,
    // we can skip re-authentication and consider it ready
    if (settings.authenticationStatus === 'authenticated' && !needsModelSelection) {
      // Only do a lightweight check if models aren't cached
      if (this.availableModels.length === 0) {
        // Try to use cached authentication without making API call
        const result = await this.checkAuthenticationAndDiscoverModels(false);
        return {
          isReady: result.isAuthenticated,
          needsApiKey: false,
          needsAuthentication: !result.isAuthenticated,
          needsModelSelection: false,
          skipAuthCheck: result.isAuthenticated
        };
      }

      return {
        isReady: true,
        needsApiKey: false,
        needsAuthentication: false,
        needsModelSelection: false,
        skipAuthCheck: true
      };
    }

    // Determine if we need authentication check
    const needsAuthentication = settings.authenticationStatus !== 'authenticated';

    // If we have API key but need to check auth or select model
    if (!needsApiKey && (needsAuthentication || needsModelSelection)) {
      // If we have a model selected but auth status is unknown/unauthenticated,
      // do a quick background check without forcing user interaction
      if (!needsModelSelection && needsAuthentication) {
        const result = await this.checkAuthenticationAndDiscoverModels(false);
        return {
          isReady: result.isAuthenticated,
          needsApiKey: false,
          needsAuthentication: !result.isAuthenticated,
          needsModelSelection: false,
          skipAuthCheck: result.isAuthenticated
        };
      }
    }

    return {
      isReady: !needsApiKey && !needsAuthentication && !needsModelSelection,
      needsApiKey,
      needsAuthentication,
      needsModelSelection
    };
  }

  /**
   * Send a request to OpenRouter
   */
  public async sendRequest(
    messages: Message[],
    modelId?: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
    }
  ): Promise<AsyncIterable<string>> {
    const settings = this.getSettings();
    
    if (!settings.apiKey) {
      throw new Error('No OpenRouter API key configured');
    }

    const selectedModelId = modelId || settings.selectedModel;
    if (!selectedModelId) {
      throw new Error('No model selected');
    }

    // Convert POML messages to OpenRouter format
    const openRouterMessages = this.convertToOpenRouterMessages(messages);

    const requestBody = {
      model: selectedModelId,
      messages: openRouterMessages,
      stream: options?.stream ?? true,
      ...(options?.temperature !== undefined && { temperature: options.temperature }),
      ...(options?.maxTokens && { max_tokens: options.maxTokens })
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://vscode.dev',
        'X-Title': 'POML VSCode Extension'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
    }

    if (options?.stream !== false) {
      return this.handleStreamingResponse(response);
    } else {
      return this.handleNonStreamingResponse(response);
    }
  }

  /**
   * Convert POML messages to OpenRouter message format
   */
  private convertToOpenRouterMessages(messages: Message[]): Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }> {
    return messages.map(message => {
      const content = typeof message.content === 'string' 
        ? message.content 
        : JSON.stringify(message.content);
      
      let role: 'user' | 'assistant' | 'system';
      switch (message.speaker) {
        case 'human':
          role = 'user';
          break;
        case 'ai':
          role = 'assistant';
          break;
        case 'system':
          role = 'system';
          break;
        default:
          role = 'user'; // Default to user for unknown speakers
      }
      
      return { role, content };
    });
  }

  /**
   * Handle streaming response from OpenRouter
   */
  private async *handleStreamingResponse(response: Response): AsyncIterable<string> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body available');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return;
            }

            try {
              const parsed: OpenRouterResponse = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content;
              if (content) {
                yield content;
              }
            } catch (e) {
              // Skip invalid JSON lines
              continue;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Handle non-streaming response from OpenRouter
   */
  private async *handleNonStreamingResponse(response: Response): AsyncIterable<string> {
    const data: OpenRouterResponse = await response.json();
    const content = data.choices[0]?.message?.content;
    if (content) {
      yield content;
    }
  }

  /**
   * Get OpenRouter settings from configuration
   */
  public getSettings(): OpenRouterSettings {
    const config = vscode.workspace.getConfiguration('poml');
    return {
      selectedModel: config.get<string>('languageModel.openrouter.selectedModel', ''),
      authenticationStatus: config.get<'unknown' | 'authenticated' | 'unauthenticated'>(
        'languageModel.openrouter.authenticationStatus', 
        'unknown'
      ),
      apiKey: config.get<string>('languageModel.openrouter.apiKey', '')
    };
  }

  /**
   * Update selected model in settings
   */
  public async updateSelectedModel(modelId: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('poml');
    await config.update('languageModel.openrouter.selectedModel', modelId, vscode.ConfigurationTarget.Global);
  }

  /**
   * Update authentication status in settings
   */
  private async updateAuthenticationStatus(status: 'authenticated' | 'unauthenticated'): Promise<void> {
    const config = vscode.workspace.getConfiguration('poml');
    await config.update('languageModel.openrouter.authenticationStatus', status, vscode.ConfigurationTarget.Global);
  }
}
