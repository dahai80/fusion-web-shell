/** Minimal localStorage/sessionStorage shim for bun test (no DOM). */
class MemStorage implements Storage {
    private map = new Map<string, string>();
    get length(): number {
        return this.map.size;
    }
    clear(): void {
        this.map.clear();
    }
    getItem(key: string): string | null {
        return this.map.get(key) ?? null;
    }
    key(index: number): string | null {
        return [...this.map.keys()][index] ?? null;
    }
    removeItem(key: string): void {
        this.map.delete(key);
    }
    setItem(key: string, value: string): void {
        this.map.set(key, String(value));
    }
}

if (typeof globalThis.localStorage === 'undefined') {
    globalThis.localStorage = new MemStorage();
    globalThis.sessionStorage = new MemStorage();
}
