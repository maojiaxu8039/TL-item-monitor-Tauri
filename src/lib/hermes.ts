import { cmd } from './commands';

export interface GatewayMessage {
  type: string;
  id?: string;
  payload: Record<string, any>;
  timestamp: string;
}

export interface ChatOptions {
  model?: string;
  no_memory?: boolean;
}

export interface ChatPayload {
  text: string;
  context?: Record<string, any>;
  options?: ChatOptions;
}

export interface SkillInfo {
  name: string;
  description: string;
  path: string;
  source: 'system' | 'workspace';
  enabled: boolean;
}

export interface ChatResponse {
  text: string;
  tool_calls: any[];
  tokens_used: number;
}

export interface ToolCall {
  tool: string;
  args: Record<string, any>;
  status: 'executing' | 'completed' | 'error';
  output?: string;
}

export type MessageHandler = (message: GatewayMessage) => void;

export class HermesGateway {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string;
  private messageHandlers: Map<string, Set<MessageHandler>> = new Map();
  private pendingMessages: Map<string, { resolve: Function; reject: Function; timeout: number }> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isConnecting = false;
  private connectionState: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';
  private connectionListeners: Set<(state: 'disconnected' | 'connecting' | 'connected' | 'error') => void> = new Set();

  constructor(url: string = 'ws://localhost:18789', token: string = 'clawx-888b6b1f5f407e4598fe7d63c82bc413') {
    this.url = url;
    this.token = token;
  }

  getConnectionState(): 'disconnected' | 'connecting' | 'connected' | 'error' {
    return this.connectionState;
  }

  onConnectionChange(listener: (state: 'disconnected' | 'connecting' | 'connected' | 'error') => void): () => void {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  private setConnectionState(state: 'disconnected' | 'connecting' | 'connected' | 'error') {
    this.connectionState = state;
    this.connectionListeners.forEach(listener => listener(state));
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    this.setConnectionState('connecting');

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(`${this.url}?token=${encodeURIComponent(this.token)}`);

        this.ws.onopen = () => {
          console.log('[OpenClawGateway] Connected to Gateway');
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.setConnectionState('connected');
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: GatewayMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('[OpenClawGateway] Failed to parse message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('[OpenClawGateway] WebSocket error:', error);
          this.isConnecting = false;
          this.setConnectionState('error');
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('[OpenClawGateway] Connection closed');
          this.isConnecting = false;
          this.ws = null;
          if (this.connectionState !== 'error') {
            this.setConnectionState('disconnected');
          }
          this.handleDisconnect();
        };
      } catch (error) {
        this.isConnecting = false;
        this.setConnectionState('error');
        reject(error);
      }
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setConnectionState('disconnected');
    this.pendingMessages.forEach(({ timeout }) => window.clearTimeout(timeout));
    this.pendingMessages.clear();
  }

  private async handleDisconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts && this.connectionState !== 'error') {
      this.reconnectAttempts++;
      const delay = 1000 * this.reconnectAttempts;
      console.log(`[OpenClawGateway] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

      await this.sleep(delay);
      try {
        await this.connect();
      } catch (error) {
        console.error('[OpenClawGateway] Reconnection failed:', error);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => window.setTimeout(resolve, ms));
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private handleMessage(message: GatewayMessage) {
    const handlers = this.messageHandlers.get(message.type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(message);
        } catch (error) {
          console.error(`[HermesGateway] Handler error for ${message.type}:`, error);
        }
      });
    }

    if (message.id && this.pendingMessages.has(message.id)) {
      const pending = this.pendingMessages.get(message.id)!;
      window.clearTimeout(pending.timeout);
      pending.resolve(message.payload);
      this.pendingMessages.delete(message.id);
    }
  }

  onMessage(type: string, handler: MessageHandler): () => void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    this.messageHandlers.get(type)!.add(handler);
    return () => this.messageHandlers.get(type)?.delete(handler);
  }

  send(message: Omit<GatewayMessage, 'timestamp' | 'id'>): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected to Gateway'));
        return;
      }

      const id = this.generateId();
      const fullMessage: GatewayMessage = {
        ...message,
        id,
        timestamp: new Date().toISOString()
      };

      const timeout = window.setTimeout(() => {
        if (this.pendingMessages.has(id)) {
          this.pendingMessages.delete(id);
          reject(new Error('Message timeout'));
        }
      }, 60000);

      this.pendingMessages.set(id, { resolve, reject, timeout });

      this.ws.send(JSON.stringify(fullMessage));
    });
  }

  async chat(text: string, context?: Record<string, any>, options?: ChatOptions): Promise<ChatResponse> {
    const response = await this.send({
      type: 'chat',
      payload: {
        text,
        context: context || {},
        options: options || {}
      }
    });

    return response as ChatResponse;
  }

  async invokeSkill(skillName: string, args: string): Promise<string> {
    const response = await this.send({
      type: 'skill_invoke',
      payload: {
        skill: skillName,
        args
      }
    });

    return response.text || 'Skill executed';
  }

  async getStatus(): Promise<any> {
    return this.send({
      type: 'status',
      payload: {}
    });
  }

  async triggerHeartbeat(dryRun: boolean = false): Promise<any> {
    return this.send({
      type: 'heartbeat_trigger',
      payload: {
        dry_run: dryRun
      }
    });
  }
}

let gatewayInstance: HermesGateway | null = null;

export function getHermesGateway(): HermesGateway {
  if (!gatewayInstance) {
    gatewayInstance = new HermesGateway();
  }
  return gatewayInstance;
}

export async function loadInstalledSkills(): Promise<SkillInfo[]> {
  try {
    const skills = await cmd.getInstalledSkills();
    return skills;
  } catch (error) {
    console.error('[HermesGateway] Failed to load skills:', error);
    return [];
  }
}
