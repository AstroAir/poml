# VSCode Language Model API Integration

This document describes the VSCode Language Model API integration added to the POML extension.

## Overview

The POML extension now supports using VSCode's built-in Language Model API (`vscode.lm`) as a provider option alongside existing external providers (OpenAI, Azure OpenAI, Anthropic, Google GenAI).

## Features

### 1. VSCode LLM Provider Support
- Added `vscode` as a new language model provider option
- Integrates with VSCode's `vscode.lm.selectChatModels()` API
- Supports all language models available through VSCode (e.g., GitHub Copilot models)

### 2. Authentication Management
- Automatic authentication status detection
- User-friendly authentication flow with guidance
- Proper error handling for authentication failures

### 3. Dynamic Model Selection
- Discovers available models automatically after authentication
- Command-based model selection with rich UI
- Persists selected model in VSCode settings

### 4. New Commands

#### `poml.checkVSCodeLLMAuth`
- **Title**: "Check VSCode Language Model Authentication"
- **Description**: Checks authentication status and discovers available models
- **Usage**: Run from Command Palette or programmatically

#### `poml.selectVSCodeLLMModel`
- **Title**: "Select VSCode Language Model"
- **Description**: Shows a quick pick to select from available models
- **Usage**: Run after authentication to choose a specific model

#### `poml.showVSCodeLLMStatus`
- **Title**: "Show VSCode Language Model Status"
- **Description**: Displays current authentication and model selection status
- **Usage**: Check current configuration status

#### `poml.configureVSCodeLLM`
- **Title**: "Configure VSCode Language Models"
- **Description**: Guided wizard for complete VSCode LLM setup
- **Usage**: Recommended for first-time setup

## Settings

### New Configuration Properties

```json
{
  "poml.languageModel.provider": {
    "enum": ["openai", "microsoft", "anthropic", "google", "vscode"],
    "default": "openai"
  },
  "poml.languageModel.vscode.selectedModel": {
    "type": "string",
    "description": "Selected VSCode Language Model ID"
  },
  "poml.languageModel.vscode.authenticationStatus": {
    "enum": ["unknown", "authenticated", "unauthenticated"],
    "description": "Authentication status (automatically managed)"
  }
}
```

## Usage

### Quick Setup
1. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run "POML: Configure VSCode Language Models"
3. Follow the guided setup wizard

### Manual Setup
1. Set `poml.languageModel.provider` to `"vscode"`
2. Run "POML: Check VSCode Language Model Authentication"
3. Authenticate with your language model provider (e.g., GitHub Copilot)
4. Run "POML: Select VSCode Language Model" to choose a model
5. Test your configuration with any POML file

### Testing Prompts
Once configured, use the existing test commands:
- "POML: Test current prompt on Chat Models" (`poml.test`)
- The extension will automatically route requests through VSCode LLM API

## Requirements

- VSCode version 1.95.0 or higher
- Authentication with a language model provider (e.g., GitHub Copilot)
- At least one language model available through VSCode

## Error Handling

The integration includes comprehensive error handling for:
- VSCode LLM API unavailability
- Authentication failures
- Missing model selection
- Network/API errors during requests
- Rate limiting and quota exceeded scenarios

## Architecture

### Core Components

1. **VSCodeLLMService** (`vscode-llm-service.ts`)
   - Singleton service for VSCode LLM API integration
   - Handles authentication, model discovery, and API calls
   - Manages settings persistence

2. **Settings Extension** (`settings.ts`)
   - Extended `LanguageModelSetting` interface for VSCode LLM
   - Helper methods for configuration validation
   - Backward compatibility with existing settings

3. **Commands** (`command/vscodeLLMCommand.ts`)
   - User-facing commands for authentication and configuration
   - Rich UI with progress indicators and error handling
   - Guided setup wizard

4. **Test Integration** (`command/testCommand.ts`)
   - Extended existing test commands to support VSCode LLM
   - Proper validation and error handling
   - Streaming response support

## Backward Compatibility

The integration maintains full backward compatibility:
- Existing external provider configurations continue to work
- No breaking changes to existing settings
- Default provider remains "openai"
- All existing functionality preserved

## Testing

The integration includes comprehensive tests:
- Unit tests for VSCodeLLMService
- Integration tests for commands
- Settings validation tests
- Error handling tests

Run tests with: `npm test` (when test infrastructure is available)

## Troubleshooting

### Common Issues

1. **"VSCode Language Model API is not available"**
   - Update VSCode to version 1.95.0 or higher
   - Ensure you're not using VSCode Web (API may not be available)

2. **"No language models available"**
   - Install and authenticate with GitHub Copilot or another language model provider
   - Check your subscription status

3. **"Authentication failed"**
   - Run the authentication command from Command Palette
   - Follow the authentication dialog prompts
   - Check your internet connection

4. **Model selection not persisting**
   - Ensure you have write permissions to VSCode settings
   - Check if workspace settings are overriding user settings

### Debug Information

Use "POML: Show VSCode Language Model Status" to get current configuration details.
