import type { AuthContext } from '../auth/context.js';

/**
 * Extension point for SOPs, recipes, HR policies and other internal documents
 * (ADR-0011 D-12). Not wired to any AI tool yet: when documents exist, a
 * permission-checked READ tool will call search() so the gateway itself does not change.
 */
export interface KnowledgeSnippet {
  documentId: string;
  title: string;
  excerpt: string;
}

export interface KnowledgeProvider {
  search(query: string, auth: AuthContext, limit: number): Promise<KnowledgeSnippet[]>;
}

export class NoKnowledgeProvider implements KnowledgeProvider {
  async search(): Promise<KnowledgeSnippet[]> {
    return [];
  }
}
