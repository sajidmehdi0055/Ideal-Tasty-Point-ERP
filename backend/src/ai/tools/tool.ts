import { z } from 'zod';
import type { AuthContext } from '../../auth/context.js';
import type { AiToolSpec } from '../types.js';

export type AiToolMode = 'READ' | 'WRITE';

/** Structured description of an action the AI proposes; never executed without explicit approval (ADR-0011 D-05). */
export interface AiProposedAction {
  tool_name: string;
  action_type: string;
  summary: string;
  payload: Record<string, unknown>;
}

interface BaseTool<S extends z.ZodType> {
  /** Unique snake_case name shown to the model. */
  name: string;
  description: string;
  /** Validates the model's arguments. Use strict objects so unknown keys are rejected. */
  input: S;
  /**
   * Server-side authorization. Must reuse the ERP's existing guards (no second
   * permission system, ADR-0011 D-04). Returns false instead of throwing.
   */
  authorize(auth: AuthContext): boolean;
}

export interface AiReadTool<S extends z.ZodType = z.ZodType> extends BaseTool<S> {
  mode: 'READ';
  /** Calls existing application services with the caller's own AuthContext. */
  execute(input: z.infer<S>, auth: AuthContext): Promise<unknown>;
}

export interface AiWriteTool<S extends z.ZodType = z.ZodType> extends BaseTool<S> {
  mode: 'WRITE';
  /** Builds a proposal only. The gateway never executes WRITE tools. */
  propose(input: z.infer<S>, auth: AuthContext): Promise<AiProposedAction>;
}

export type AiTool = AiReadTool | AiWriteTool;

/** Helpers keep generic inference while storing tools in one registry. */
export const readTool = <S extends z.ZodType>(tool: AiReadTool<S>): AiTool => tool as unknown as AiTool;
export const writeTool = <S extends z.ZodType>(tool: AiWriteTool<S>): AiTool => tool as unknown as AiTool;

export class AiToolRegistry {
  private readonly tools = new Map<string, AiTool>();

  constructor(tools: AiTool[]) {
    for (const tool of tools) {
      if (!/^[a-z][a-z0-9_]{2,63}$/.test(tool.name)) throw new Error(`Invalid AI tool name: ${tool.name}`);
      if (this.tools.has(tool.name)) throw new Error(`Duplicate AI tool name: ${tool.name}`);
      this.tools.set(tool.name, tool);
    }
  }

  get(name: string): AiTool | undefined {
    return this.tools.get(name);
  }

  /** Tools this caller may see. WRITE tools are hidden unless write actions are enabled. */
  available(auth: AuthContext, options: { includeWrite: boolean }): AiTool[] {
    return [...this.tools.values()].filter(tool => (tool.mode === 'READ' || options.includeWrite) && safeAuthorize(tool, auth));
  }

  static spec(tool: AiTool): AiToolSpec {
    const schema = z.toJSONSchema(tool.input, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
    delete schema.$schema;
    return { name: tool.name, description: tool.description, parameters: schema };
  }
}

export function safeAuthorize(tool: AiTool, auth: AuthContext): boolean {
  try {
    return tool.authorize(auth) === true;
  } catch {
    return false;
  }
}
