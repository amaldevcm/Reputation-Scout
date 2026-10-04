export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
}

export interface SearchProvider {
  name: string;
  search(query: string, count?: number): Promise<SearchResult[]>;
}
