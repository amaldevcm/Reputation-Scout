export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  // A longer page excerpt, when the provider returns one (Parallel, Firecrawl).
  excerpt?: string;
}

export interface SearchProvider {
  name: string;
  search(query: string, count?: number): Promise<SearchResult[]>;
}
