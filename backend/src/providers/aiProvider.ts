export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamCompletionInput {
  model: string;
  spreadsheetContext: string;
  messages: AiMessage[];
  signal: AbortSignal;
  onDelta: (text: string) => void;
}

export interface StreamCompletionResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AiProvider {
  streamCompletion(input: StreamCompletionInput): Promise<StreamCompletionResult>;
}
