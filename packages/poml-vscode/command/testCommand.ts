import * as vscode from 'vscode';
import { Command } from '../util/commandManager';
import { POMLWebviewPanelManager } from '../panel/manager';
import { PanelSettings } from 'poml-vscode/panel/types';
import { PreviewMethodName, PreviewParams, PreviewResponse } from '../panel/types';
import { getClient } from '../extension';
import { Message, RichContent } from 'poml';
const { BaseChatModel } = require('@langchain/core/language_models/chat_models'); // eslint-disable-line
const {
  HumanMessage,
  AIMessage,
  SystemMessage,
  BaseMessage,
  MessageContent,
  MessageContentComplex
} = require('@langchain/core/messages'); // eslint-disable-line
// import { ChatAnthropic } from "@langchain/anthropic";
const { AzureChatOpenAI, ChatOpenAI, AzureOpenAI, OpenAI } = require('@langchain/openai'); // eslint-disable-line
const { ChatGoogleGenerativeAI, GoogleGenerativeAI } = require('@langchain/google-genai'); // eslint-disable-line
import ModelClient from '@azure-rest/ai-inference';
import { AzureKeyCredential } from '@azure/core-auth';
import { createSseStream } from '@azure/core-sse';
import { fileURLToPath } from 'url';
import { LanguageModelSetting } from 'poml-vscode/settings';
import { IncomingMessage } from 'node:http';
import { getTelemetryReporter } from 'poml-vscode/util/telemetryClient';
import { TelemetryEvent } from 'poml-vscode/util/telemetryServer';
import { VSCodeLLMService } from '../vscode-llm-service';
import { OpenRouterService } from '../openrouter-service';

let _globalGenerationController: GenerationController | undefined = undefined;

class GenerationController {
  private readonly abortControllers: AbortController[];

  private constructor() {
    this.abortControllers = [];
  }

  public static getNewAbortController() {
    if (!_globalGenerationController) {
      _globalGenerationController = new GenerationController();
    }
    const controller = new AbortController();
    _globalGenerationController.abortControllers.push(controller);
    return controller;
  }

  public static abortAll() {
    if (_globalGenerationController) {
      for (const controller of _globalGenerationController.abortControllers) {
        controller.abort();
      }
      _globalGenerationController.abortControllers.length = 0;
    }
  }
}

let outputChannel: vscode.OutputChannel | undefined = undefined;
let lastCommand: string | undefined = undefined;

function getOutputChannel() {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('POML', 'log');
  }
  return outputChannel;
}

export class TestCommand implements Command {
  public id = 'poml.test';
  private readonly outputChannel: vscode.OutputChannel;

  public constructor(private readonly previewManager: POMLWebviewPanelManager) {
    this.outputChannel = getOutputChannel();
  }

  public execute(uri?: vscode.Uri, panelSettings?: PanelSettings) {
    lastCommand = this.id;
    if (!(uri instanceof vscode.Uri)) {
      if (vscode.window.activeTextEditor) {
        // we are relaxed and don't check for poml files
        uri = vscode.window.activeTextEditor.document.uri;
      }
    }

    if (uri) {
      this.testPrompt(uri);
    }
  }

  public async testPrompt(uri: vscode.Uri) {
    getTelemetryReporter()?.reportTelemetry(TelemetryEvent.CommandInvoked, {
      command: this.id
    });
    const fileUrl = fileURLToPath(uri.toString());
    this.outputChannel.show(true);
    const reporter = getTelemetryReporter();
    const reportParams: { [key: string]: string } = {};
    if (reporter) {
      const document = await vscode.workspace.openTextDocument(uri);
      reportParams.uri = uri.toString();
      reportParams.rawText = document.getText();
    }

    // Check if language model settings are configured
    const setting = this.getLanguageModelSettings(uri);
    if (!setting || !setting.provider) {
      vscode.window.showErrorMessage(
        'Language model provider is not configured. Please set your provider in the extension settings before testing prompts.'
      );
      this.log('error', 'Prompt test aborted: LLM provider not configured.');
      return;
    }

    // Validate settings based on provider
    if (setting.provider === 'vscode') {
      const llmService = VSCodeLLMService.getInstance();
      if (!llmService.isAvailable()) {
        vscode.window.showErrorMessage(
          'VSCode Language Model API is not available. Please update to a newer version of VSCode (1.90+).'
        );
        this.log('error', 'Prompt test aborted: VSCode LLM API not available.');
        return;
      }

      const authStatus = llmService.getAuthenticationStatus();
      if (authStatus !== 'authenticated') {
        const action = await vscode.window.showErrorMessage(
          'You need to authenticate with a language model provider first.',
          'Check Authentication'
        );
        if (action === 'Check Authentication') {
          await vscode.commands.executeCommand('poml.checkVSCodeLLMAuth');
        }
        this.log('error', 'Prompt test aborted: VSCode LLM not authenticated.');
        return;
      }

      if (!setting.vscode?.selectedModel) {
        const action = await vscode.window.showErrorMessage(
          'No VSCode language model selected.',
          'Select Model'
        );
        if (action === 'Select Model') {
          await vscode.commands.executeCommand('poml.selectVSCodeLLMModel');
        }
        this.log('error', 'Prompt test aborted: No VSCode LLM model selected.');
        return;
      }
    } else if (setting.provider === 'openrouter') {
      const openRouterService = OpenRouterService.getInstance();

      const openRouterSettings = openRouterService.getSettings();
      if (!openRouterSettings.apiKey) {
        const action = await vscode.window.showErrorMessage(
          'OpenRouter API key is not configured.',
          'Configure API Key'
        );
        if (action === 'Configure API Key') {
          await vscode.commands.executeCommand('poml.configureOpenRouter');
        }
        this.log('error', 'Prompt test aborted: OpenRouter API key not configured.');
        return;
      }

      const authStatus = openRouterService.getAuthenticationStatus();
      if (authStatus !== 'authenticated') {
        const action = await vscode.window.showErrorMessage(
          'You need to authenticate with OpenRouter first.',
          'Check Authentication'
        );
        if (action === 'Check Authentication') {
          await vscode.commands.executeCommand('poml.checkOpenRouterAuth');
        }
        this.log('error', 'Prompt test aborted: OpenRouter not authenticated.');
        return;
      }

      if (!openRouterSettings.selectedModel) {
        const action = await vscode.window.showErrorMessage(
          'No OpenRouter model selected.',
          'Select Model'
        );
        if (action === 'Select Model') {
          await vscode.commands.executeCommand('poml.selectOpenRouterModel');
        }
        this.log('error', 'Prompt test aborted: No OpenRouter model selected.');
        return;
      }
    } else {
      // Validate external provider settings
      if (!setting.model || !setting.apiKey || !setting.apiUrl) {
        vscode.window.showErrorMessage(
          'Language model settings are not fully configured. Please set your model, API key, and endpoint in the extension settings before testing prompts.'
        );
        this.log('error', 'Prompt test aborted: External LLM settings not configured.');
        return;
      }
    }

    this.log(
      'info',
      `Testing prompt with ${this.isChatting ? 'chat model' : 'text completion model'}: ${fileUrl}`
    );
    this.log('info', `Language model provider: ${setting.provider}`);
    this.log('info', `Language model: ${setting.model}`);
    if (setting.provider === 'vscode') {
      this.log('info', `VSCode LLM selected model: ${setting.vscode?.selectedModel}`);
      this.log('info', `VSCode LLM auth status: ${setting.vscode?.authenticationStatus}`);
    }
    const startTime = Date.now();
    let nextInterval: number = 1;
    const showProgress = () => {
      const timeElapsed = (Date.now() - startTime) / 1000;
      this.log('info', `Test in progress. ${Math.round(timeElapsed)} seconds elapsed.`);
      nextInterval *= 2;
      timer = setTimeout(showProgress, nextInterval * 1000);
    };

    let timer = setTimeout(showProgress, nextInterval * 1000);
    let result: string[] = [];
    try {
      const prompt = await this.renderPrompt(uri);
      const setting = this.getLanguageModelSettings(uri);
      reporter?.reportTelemetry(TelemetryEvent.PromptTestingStart, {
        ...reportParams,
        languageModel: JSON.stringify(setting),
        rendered: JSON.stringify(prompt)
      });

      const stream = this.routeStream(prompt, setting);
      for await (const chunk of stream) {
        clearTimeout(timer);
        result.push(chunk);
        this.outputChannel.append(chunk);
      }
      this.outputChannel.appendLine('');
      const timeElapsed = Date.now() - startTime;
      this.log(
        'info',
        `Test completed in ${Math.round(timeElapsed / 1000)} seconds. Language models can make mistakes. Check important info.`
      );

      if (reporter) {
        reporter.reportTelemetry(TelemetryEvent.PromptTestingEnd, {
          ...reportParams,
          result: result.join(''),
          timeElapsed: timeElapsed
        });
      }
    } catch (e) {
      clearTimeout(timer);
      vscode.window.showErrorMessage(String(e));
      if (reporter) {
        reporter.reportTelemetry(TelemetryEvent.PromptTestingError, {
          ...reportParams,
          error: e ? e.toString() : '',
          partialResult: result.join('')
        });
      }

      if (e && (e as any).stack) {
        this.log('error', (e as any).stack);
      } else {
        this.log('error', String(e));
      }
    }
  }

  protected get isChatting() {
    return true;
  }

  private async renderPrompt(uri: vscode.Uri) {
    this.log('info', `Starting to render prompt: ${uri.toString()}`);

    const options = this.previewManager.previewConfigurations.getResourceOptions(uri);
    this.log(
      'info',
      `Resource options: contexts=${options.contexts.length}, stylesheets=${options.stylesheets.length}`
    );

    // Provide comprehensive context variables that POML templates might expect
    // For test command, we provide default/placeholder values since there's no user interaction

    // For test command, we don't use actual files to avoid file system errors
    // Instead, we provide safe default context values
    this.log('info', 'Using safe default context for test command (no external files)');

    // For test command, provide safe default context that doesn't require external files
    // This prevents errors when templates reference files that don't exist
    // We use empty files array to prevent the template from trying to read non-existent files
    const inlineContext = {
      files: [], // Always empty for test command to prevent file read errors
      file: '', // Empty string to prevent undefined variable errors
      prompt: 'Test prompt execution', // Default prompt text for testing
      // Add other common variables that templates might expect
      user: 'Test User',
      task: 'Test prompt execution',
      request: 'Test prompt execution',
      // Additional safe defaults
      content: 'Sample content for testing',
      text: 'Sample text for testing'
    };

    // Log the context being used for testing
    this.log('info', 'Test context prepared with safe default values (no external files)');

    this.log('info', `Inline context: ${JSON.stringify(inlineContext, null, 2)}`);

    const requestParams: PreviewParams = {
      uri: uri.toString(),
      speakerMode: this.isChatting,
      displayFormat: 'rendered',
      contexts: options.contexts,
      stylesheets: options.stylesheets,
      inlineContext: inlineContext
    };

    this.log(
      'info',
      `Sending preview request with params: ${JSON.stringify({
        uri: requestParams.uri,
        speakerMode: requestParams.speakerMode,
        displayFormat: requestParams.displayFormat,
        contextsCount: requestParams.contexts.length,
        stylesheetsCount: requestParams.stylesheets.length,
        inlineContext: requestParams.inlineContext
      })}`
    );

    let response: PreviewResponse;
    try {
      response = await getClient().sendRequest<PreviewResponse>(PreviewMethodName, requestParams);
    } catch (error) {
      this.log('error', `Failed to send preview request: ${error}`);
      throw error;
    }

    this.log('info', `Preview response received. Has error: ${!!response.error}`);

    if (response.error) {
      this.log(
        'error',
        `Preview response error details: ${JSON.stringify(response.error, null, 2)}`
      );

      // Try to provide more helpful error information
      let errorMessage = '';
      if (Array.isArray(response.error)) {
        errorMessage = response.error
          .map(err => (typeof err === 'object' ? JSON.stringify(err, null, 2) : String(err)))
          .join('\n');
      } else {
        errorMessage = String(response.error);
      }

      this.log('error', `Formatted error message: ${errorMessage}`);
      throw new Error(`Error rendering prompt: ${uri}\n${errorMessage}`);
    }

    this.log(
      'info',
      `Successfully rendered prompt. Content type: ${Array.isArray(response.content) ? 'Message[]' : 'RichContent'}`
    );
    return response.content;
  }

  private async *routeStream(
    prompt: Message[] | RichContent,
    settings: LanguageModelSetting
  ): AsyncGenerator<string> {
    if (settings.provider === 'vscode') {
      yield* this.vscodeStream(prompt as Message[], settings);
    } else if (settings.provider === 'openrouter') {
      yield* this.openrouterStream(prompt as Message[], settings);
    } else if (
      settings.provider === 'microsoft' &&
      settings.apiUrl?.includes('.models.ai.azure.com')
    ) {
      yield* this.azureAiStream(prompt as Message[], settings);
    } else {
      yield* this.langchainStream(prompt, settings);
    }
  }

  private async *azureAiStream(
    prompt: Message[],
    settings: LanguageModelSetting
  ): AsyncGenerator<string> {
    if (!settings.apiUrl || !settings.apiKey) {
      throw new Error('Azure AI API URL or API key is not configured.');
    }
    if (!this.isChatting) {
      throw new Error('Azure AI is only supported for chat models.');
    }
    const client = ModelClient(settings.apiUrl, new AzureKeyCredential(settings.apiKey));

    const args: any = {};
    if (settings.maxTokens) {
      args.max_tokens = settings.maxTokens;
    }
    if (settings.temperature) {
      args.temperature = settings.temperature;
    }
    if (settings.model) {
      args.model = settings.model;
    }

    const response = await client
      .path('/chat/completions')
      .post({
        body: {
          messages: this.toMessageObjects(prompt, 'openai'),
          stream: true,
          ...args
        }
      })
      .asNodeStream();

    const stream = response.body;
    if (!stream) {
      throw new Error('The response stream is undefined');
    }

    if (response.status !== '200') {
      throw new Error(
        `Failed to get chat completions (status code ${response.status}): ${await streamToString(stream)}`
      );
    }

    const sses = createSseStream(stream as IncomingMessage);

    for await (const event of sses) {
      if (event.data === '[DONE]') {
        return;
      }
      for (const choice of JSON.parse(event.data).choices) {
        yield choice.delta?.content ?? '';
      }
    }

    async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks).toString('utf-8');
    }
  }

  private async *vscodeStream(
    prompt: Message[],
    settings: LanguageModelSetting
  ): AsyncGenerator<string> {
    if (!this.isChatting) {
      throw new Error('VSCode Language Model API only supports chat models.');
    }

    const llmService = VSCodeLLMService.getInstance();
    const selectedModelId = settings.vscode?.selectedModel;

    if (!selectedModelId) {
      throw new Error('No VSCode language model selected.');
    }

    try {
      const options: any = {};
      if (settings.temperature !== undefined) {
        options.temperature = settings.temperature;
      }
      if (settings.maxTokens) {
        options.maxTokens = settings.maxTokens;
      }

      // Create a VSCode CancellationToken from AbortSignal
      const abortController = GenerationController.getNewAbortController();
      const cancellationTokenSource = new vscode.CancellationTokenSource();

      // Link AbortSignal to CancellationToken
      abortController.signal.addEventListener('abort', () => {
        cancellationTokenSource.cancel();
      });

      const stream = await llmService.sendRequest(
        prompt,
        selectedModelId,
        options,
        cancellationTokenSource.token
      );

      for await (const chunk of stream) {
        yield chunk;
      }
    } catch (error) {
      if (error instanceof vscode.LanguageModelError) {
        // Handle different types of LanguageModelError
        if (error instanceof vscode.LanguageModelError.NoPermissions) {
          throw new Error(
            'No permission to access language models. Please authenticate with a language model provider.'
          );
        } else if (error instanceof vscode.LanguageModelError.Blocked) {
          throw new Error('Access to language models is blocked.');
        } else if (error instanceof vscode.LanguageModelError.NotFound) {
          throw new Error('Selected language model not found.');
        } else {
          throw new Error(`Language model error: ${error.message}`);
        }
      }
      throw error;
    }
  }

  private async *openrouterStream(
    prompt: Message[],
    settings: LanguageModelSetting
  ): AsyncGenerator<string> {
    if (!this.isChatting) {
      throw new Error('OpenRouter only supports chat models.');
    }

    const openRouterService = OpenRouterService.getInstance();
    const selectedModelId = settings.openrouter?.selectedModel;

    if (!selectedModelId) {
      throw new Error('No OpenRouter model selected.');
    }

    try {
      const options: any = {};
      if (settings.temperature !== undefined) {
        options.temperature = settings.temperature;
      }
      if (settings.maxTokens) {
        options.maxTokens = settings.maxTokens;
      }
      options.stream = true; // Enable streaming

      const stream = await openRouterService.sendRequest(
        prompt,
        selectedModelId,
        options
      );

      for await (const chunk of stream) {
        yield chunk;
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`OpenRouter error: ${error.message}`);
      }
      throw error;
    }
  }

  private async *langchainStream(
    prompt: Message[] | RichContent,
    settings: LanguageModelSetting
  ): AsyncGenerator<string> {
    const lm = this.getActiveLangchainModel(settings);
    const lcPrompt = this.isChatting
      ? this.toLangchainMessages(
          prompt as Message[],
          settings.provider === 'google' ? 'google' : 'openai'
        )
      : this.toLangchainString(prompt as RichContent);
    GenerationController.abortAll();
    const stream = await lm.stream(lcPrompt, {
      signal: GenerationController.getNewAbortController().signal
    });
    for await (const chunk of stream) {
      if (typeof chunk === 'string') {
        yield chunk;
      } else if (typeof chunk.content === 'string') {
        yield chunk.content;
      } else {
        for (const complex of chunk.content) {
          yield `[not displayable ${complex.type}]`;
        }
      }
    }
  }

  private getActiveLangchainModel(settings: LanguageModelSetting) {
    switch (settings.provider) {
      case 'anthropic':
        // return new ChatAnthropic({
        //   model: settings.model,
        //   anthropicApiKey: settings.apiKey,
        //   anthropicApiUrl: settings.apiUrl,
        //   maxTokens: settings.maxTokens,
        //   temperature: settings.temperature
        // });
        throw new Error('Anthropic is currently not supported');
      case 'microsoft':
        return new (this.isChatting ? AzureChatOpenAI : AzureOpenAI)({
          azureOpenAIApiDeploymentName: settings.model,
          azureOpenAIApiKey: settings.apiKey,
          azureOpenAIEndpoint: settings.apiUrl,
          azureOpenAIApiVersion: settings.apiVersion,
          maxTokens: settings.maxTokens,
          temperature: settings.temperature
        });
      case 'openai':
        return new (this.isChatting ? ChatOpenAI : OpenAI)({
          model: settings.model,
          maxTokens: settings.maxTokens,
          temperature: settings.temperature,
          apiKey: settings.apiKey,
          configuration: {
            apiKey: settings.apiKey,
            baseURL: settings.apiUrl
          }
        });
      case 'google':
        return new (this.isChatting ? ChatGoogleGenerativeAI : GoogleGenerativeAI)({
          model: settings.model,
          maxOutputTokens: settings.maxTokens,
          temperature: settings.temperature,
          apiKey: settings.apiKey,
          apiVersion: settings.apiVersion,
          baseUrl: settings.apiUrl
        });
      default:
        throw new Error(`Unsupported language model provider: ${settings.provider}`);
    }
  }

  private toLangchainMessages(messages: Message[], style: 'openai' | 'google') {
    return messages.map(msg => {
      const content = this.messageToContentObject(msg, style);
      switch (msg.speaker) {
        case 'ai':
          return new AIMessage({ content });
        case 'human':
          return new HumanMessage({ content });
        case 'system':
          return new SystemMessage({ content });
        default:
          throw new Error(`Invalid speaker: ${msg.speaker}`);
      }
    });
  }

  private toMessageObjects(messages: Message[], style: 'openai' | 'google') {
    // Note: style parameter reserved for future use to handle different message formats
    const speakerMapping = {
      ai: 'assistant',
      human: 'user',
      system: 'system'
    };
    return messages.map(msg => {
      return {
        role: speakerMapping[msg.speaker] ?? msg.speaker,
        content: msg.content
      };
    });
  }

  private toLangchainString(content: RichContent): string {
    if (typeof content === 'string') {
      return content;
    }
    return content
      .map(part => {
        if (typeof part === 'string') {
          return part;
        } else {
          return `[not displayable ${part.type}]`;
        }
      })
      .join('');
  }

  private messageToContentObject(msg: Message, style: 'openai' | 'google') {
    if (typeof msg.content === 'string') {
      return [
        {
          type: 'text',
          text: msg.content
        }
      ];
    } else {
      return msg.content.map(part => {
        if (typeof part === 'string') {
          return {
            type: 'text',
            text: part
          };
        } else if (part.type.startsWith('image/')) {
          if (style === 'google') {
            return {
              type: 'image_url',
              image_url: `data:${part.type};base64,${part.base64}`
            };
          } else {
            return {
              type: 'image_url',
              image_url: {
                url: `data:${part.type};base64,${part.base64}`
              }
            };
          }
        } else {
          throw new Error(`Unsupported content type: ${part.type}`);
        }
      });
    }
  }

  private getLanguageModelSettings(uri: vscode.Uri) {
    const settings = this.previewManager.previewConfigurations;
    return settings.loadAndCacheSettings(uri).languageModel;
  }

  private log(level: 'error' | 'info', message: string) {
    const tzOffset = new Date().getTimezoneOffset() * 60000;
    const time = new Date(Date.now() - tzOffset).toISOString().replace('T', ' ').replace('Z', '');
    this.outputChannel.appendLine(`${time} [${level}] ${message}`);
  }
}

export class TestNonChatCommand extends TestCommand {
  public id = 'poml.testNonChat';

  protected get isChatting() {
    return false;
  }
}

export class TestRerunCommand implements Command {
  public id = 'poml.testRerun';
  private readonly outputChannel: vscode.OutputChannel;

  constructor(_previewManager: POMLWebviewPanelManager) {
    this.outputChannel = getOutputChannel();
  }

  public execute(...args: any[]): void {
    getTelemetryReporter()?.reportTelemetry(TelemetryEvent.CommandInvoked, {
      command: this.id
    });
    if (lastCommand) {
      this.outputChannel.clear();
      vscode.commands.executeCommand(lastCommand, ...args);
    } else {
      vscode.window.showErrorMessage('No test command to rerun');
    }
  }
}

export class TestAbortCommand implements Command {
  public readonly id = 'poml.testAbort';

  public constructor(_previewManager: POMLWebviewPanelManager) {}

  public execute() {
    getTelemetryReporter()?.reportTelemetry(TelemetryEvent.PromptTestingAbort, {});
    GenerationController.abortAll();
  }
}
