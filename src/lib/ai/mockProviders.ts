import type { ProviderInfo } from '@/types/ai'

// Copia dev de los presets de Rust para poder desarrollar Settings en navegador
// (solo se carga vía import dinámico cuando no hay entorno Tauri)
export const MOCK_PROVIDERS: ProviderInfo[] = [
  { id: 'openai', name: 'OpenAI', kind: 'cloud', requiresKey: true, baseUrl: 'https://api.openai.com/v1', defaultModels: [
    { id: 'gpt-4o', maxContextTokens: 128000, modalities: ['text', 'image'] },
    { id: 'gpt-4o-mini', maxContextTokens: 128000, modalities: ['text', 'image'] },
    { id: 'gpt-4.1', maxContextTokens: 1000000, modalities: ['text', 'image'] },
  ]},
  { id: 'anthropic', name: 'Anthropic (Claude)', kind: 'cloud', requiresKey: true, baseUrl: 'https://api.anthropic.com/v1', defaultModels: [
    { id: 'claude-sonnet-4-5', maxContextTokens: 200000, modalities: ['text', 'image'] },
    { id: 'claude-opus-4-1', maxContextTokens: 200000, modalities: ['text', 'image'] },
    { id: 'claude-haiku-4-5', maxContextTokens: 200000, modalities: ['text', 'image'] },
  ]},
  { id: 'deepseek', name: 'DeepSeek', kind: 'cloud', requiresKey: true, baseUrl: 'https://api.deepseek.com/v1', defaultModels: [
    { id: 'deepseek-chat', maxContextTokens: 128000, modalities: ['text'] },
    { id: 'deepseek-reasoner', maxContextTokens: 128000, modalities: ['text'] },
  ]},
  { id: 'mistral', name: 'Mistral AI', kind: 'cloud', requiresKey: true, baseUrl: 'https://api.mistral.ai/v1', defaultModels: [
    { id: 'mistral-large-latest', maxContextTokens: 128000, modalities: ['text'] },
    { id: 'mistral-small-latest', maxContextTokens: 128000, modalities: ['text'] },
  ]},
  { id: 'xai', name: 'xAI (Grok)', kind: 'cloud', requiresKey: true, baseUrl: 'https://api.x.ai/v1', defaultModels: [
    { id: 'grok-4', maxContextTokens: 256000, modalities: ['text', 'image'] },
    { id: 'grok-3', maxContextTokens: 131072, modalities: ['text'] },
    { id: 'grok-code-fast-1', maxContextTokens: 256000, modalities: ['text', 'image'] },
  ]},
  { id: 'groq', name: 'Groq', kind: 'cloud', requiresKey: true, baseUrl: 'https://api.groq.com/openai/v1', defaultModels: [
    { id: 'llama-3.3-70b-versatile', maxContextTokens: 131072, modalities: ['text'] },
    { id: 'llama-3.1-8b-instant', maxContextTokens: 131072, modalities: ['text'] },
  ]},
  { id: 'nvidia-nim', name: 'NVIDIA NIM', kind: 'cloud', requiresKey: true, baseUrl: 'https://integrate.api.nvidia.com/v1', defaultModels: [
    { id: 'meta/llama-3.3-70b-instruct', maxContextTokens: 128000, modalities: ['text'] },
    { id: 'nvidia/llama-3.1-nemotron-70b-instruct', maxContextTokens: 128000, modalities: ['text'] },
  ]},
  { id: 'together', name: 'Together AI', kind: 'cloud', requiresKey: true, baseUrl: 'https://api.together.xyz/v1', defaultModels: [
    { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', maxContextTokens: 128000, modalities: ['text'] },
    { id: 'Qwen/Qwen2.5-Coder-32B-Instruct', maxContextTokens: 128000, modalities: ['text'] },
  ]},
  { id: 'qwen', name: 'Qwen', kind: 'cloud', requiresKey: true, baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', defaultModels: [
    { id: 'qwen-max', maxContextTokens: 32768, modalities: ['text'] },
    { id: 'qwen-plus', maxContextTokens: 131072, modalities: ['text'] },
    { id: 'qwen-coder-plus', maxContextTokens: 131072, modalities: ['text'] },
  ]},
  { id: 'minimax', name: 'MiniMax', kind: 'cloud', requiresKey: true, baseUrl: 'https://api.minimaxi.chat/v1', defaultModels: [
    { id: 'MiniMax-Text-01', maxContextTokens: 1000000, modalities: ['text'] },
    { id: 'abab6.5s-chat', maxContextTokens: 16384, modalities: ['text'] },
  ]},
  { id: 'gemini', name: 'Google Gemini', kind: 'cloud', requiresKey: true, baseUrl: 'https://generativelanguage.googleapis.com/v1beta', defaultModels: [
    { id: 'gemini-2.5-pro', maxContextTokens: 1048576, modalities: ['text', 'image', 'audio', 'video'] },
    { id: 'gemini-2.5-flash', maxContextTokens: 1048576, modalities: ['text', 'image', 'audio', 'video'] },
    { id: 'gemini-2.5-flash-lite', maxContextTokens: 1048576, modalities: ['text', 'image'] },
  ]},
  { id: 'ollama', name: 'Ollama (local)', kind: 'local', requiresKey: false, baseUrl: 'http://localhost:11434', defaultModels: [
    { id: 'llama3.2', maxContextTokens: 131072, modalities: ['text'] },
    { id: 'qwen2.5-coder', maxContextTokens: 131072, modalities: ['text'] },
  ]},
  { id: 'lm-studio', name: 'LM Studio (local)', kind: 'local', requiresKey: false, baseUrl: 'http://localhost:1234/v1', defaultModels: [] },
]