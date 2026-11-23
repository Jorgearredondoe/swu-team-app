/** PostgREST caps responses (max_rows = 1000), so large reads are fetched page by page. */
export const PAGE_SIZE = 1000;

export async function fetchAllPages<T>(request: (from: number, to: number) => Promise<T[]>): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = await request(from, from + PAGE_SIZE - 1);
    all.push(...page);
    if (page.length < PAGE_SIZE) return all;
  }
}
