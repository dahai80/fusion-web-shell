import type { MessageRow, ThreadRow, TopicRow } from './types';

/** Minimal key/value object-store seam so the store logic stays testable:
 *  MemoryAdapter for bun test, IndexedDBAdapter for the browser (issue #155). */
export interface StorageAdapter {
    readonly kind: 'memory' | 'indexeddb';
    /** Persisted schema version; 0 = fresh database. */
    getVersion(): Promise<number>;
    setVersion(v: number): Promise<void>;
    getAll<T extends MessageRow | TopicRow | ThreadRow>(store: string): Promise<T[]>;
    get<T extends MessageRow | TopicRow | ThreadRow>(
        store: string,
        key: string
    ): Promise<T | undefined>;
    put(store: string, key: string, value: MessageRow | TopicRow | ThreadRow): Promise<void>;
    del(store: string, key: string): Promise<void>;
}

type Row = MessageRow | TopicRow | ThreadRow;

export class MemoryAdapter implements StorageAdapter {
    readonly kind = 'memory' as const;
    private version = 0;
    private stores = new Map<string, Map<string, Row>>();

    private store(name: string): Map<string, Row> {
        let s = this.stores.get(name);
        if (!s) {
            s = new Map();
            this.stores.set(name, s);
        }
        return s;
    }

    async getVersion(): Promise<number> {
        return this.version;
    }

    async setVersion(v: number): Promise<void> {
        this.version = v;
    }

    async getAll<T extends Row>(store: string): Promise<T[]> {
        return [...this.store(store).values()] as T[];
    }

    async get<T extends Row>(store: string, key: string): Promise<T | undefined> {
        return this.store(store).get(key) as T | undefined;
    }

    async put(store: string, key: string, value: Row): Promise<void> {
        this.store(store).set(key, value);
    }

    async del(store: string, key: string): Promise<void> {
        this.store(store).delete(key);
    }
}

const DB_NAME = 'fusion.conversations';
const STORES = ['messages', 'topics', 'threads', 'meta'] as const;
const SCHEMA_VERSION = 1;

/** Browser adapter. Opens lazily; upgrade applies the store list once. */
export class IndexedDBAdapter implements StorageAdapter {
    readonly kind = 'indexeddb' as const;
    private dbp: Promise<IDBDatabase> | null = null;

    private open(): Promise<IDBDatabase> {
        if (!this.dbp) {
            this.dbp = new Promise((resolve, reject) => {
                const req = indexedDB.open(DB_NAME, SCHEMA_VERSION);
                req.onupgradeneeded = () => {
                    const db = req.result;
                    for (const name of STORES) {
                        if (!db.objectStoreNames.contains(name)) {
                            db.createObjectStore(name);
                        }
                    }
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error ?? new Error('indexeddb open failed'));
            });
            console.log(`[conversations] indexeddb opening ${DB_NAME} v${SCHEMA_VERSION}`);
        }
        return this.dbp;
    }

    private async tx<T>(
        store: string,
        mode: IDBTransactionMode,
        fn: (os: IDBObjectStore) => IDBRequest<T>
    ): Promise<T> {
        const db = await this.open();
        return new Promise<T>((resolve, reject) => {
            const t = db.transaction(store, mode);
            const req = fn(t.objectStore(store));
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error ?? new Error('indexeddb request failed'));
        });
    }

    async getVersion(): Promise<number> {
        try {
            const v = await this.tx<number>(
                'meta',
                'readonly',
                (os) => os.get('schemaVersion') as IDBRequest<number>
            );
            return typeof v === 'number' ? v : 0;
        } catch {
            return 0;
        }
    }

    async setVersion(v: number): Promise<void> {
        await this.tx(
            'meta',
            'readwrite',
            (os) => os.put(v, 'schemaVersion') as IDBRequest<number>
        );
    }

    async getAll<T extends Row>(store: string): Promise<T[]> {
        return (
            (await this.tx<T[]>(store, 'readonly', (os) => os.getAll() as IDBRequest<T[]>)) ?? []
        );
    }

    async get<T extends Row>(store: string, key: string): Promise<T | undefined> {
        return (
            (await this.tx<T>(store, 'readonly', (os) => os.get(key) as IDBRequest<T>)) ?? undefined
        );
    }

    async put(store: string, key: string, value: Row): Promise<void> {
        await this.tx(store, 'readwrite', (os) => os.put(value, key) as IDBRequest<number>);
    }

    async del(store: string, key: string): Promise<void> {
        await this.tx(store, 'readwrite', (os) => os.delete(key) as IDBRequest<undefined>);
    }
}
