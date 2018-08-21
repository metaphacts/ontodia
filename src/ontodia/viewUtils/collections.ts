export function createStringMap<V>(): { [key: string]: V } {
    const map = Object.create(null);
    // tslint:disable-next-line:no-string-literal
    delete map['hint'];
    return map;
}

export function createNumberMap<V>(): { [key: number]: V } {
    return createStringMap() as { [key: number]: V };
}

export function hasOwnProperty(collection: object, key: string | number) {
    return Object.prototype.hasOwnProperty.call(collection, key);
}

export function isEmptyMap(map: object) {
    for (const key in map) {
        if (hasOwnProperty(map, key)) { return false; }
    }
    return true;
}

/**
 * Clones Map collection. Required due to IE11 not supporing `new Map(map)`.
 */
export function cloneMap<K, V>(map: ReadonlyMap<K, V>): Map<K, V> {
    const clone = new Map<K, V>();
    map.forEach((value, key) => clone.set(key, value));
    return clone;
}

/**
 * Clones Set collection. Required due to IE11 not supporing `new Set(set)`.
 */
export function cloneSet<T>(set: ReadonlySet<T>): Set<T> {
    const clone = new Set<T>();
    set.forEach(item => clone.add(item));
    return clone;
}

export class OrderedMap<V> {
    private mapping: { [key: string]: V };
    private ordered: V[];

    constructor() {
        this.mapping = createStringMap<V>();
        this.ordered = [];
    }

    get items(): ReadonlyArray<V> {
        return this.ordered;
    }

    get(key: string): V | undefined {
        return this.mapping[key];
    }

    push(key: string, value: V) {
        if (key in this.mapping) {
            const previous = this.mapping[key];
            if (previous === value) { return; }
            const index = this.ordered.indexOf(previous);
            this.ordered.splice(index, 1);
        }
        this.mapping[key] = value;
        this.ordered.push(value);
    }

    delete(key: string): V | undefined {
        if (!(key in this.mapping)) {
            return undefined;
        }
        const previous = this.mapping[key];
        const index = this.ordered.indexOf(previous);
        this.ordered.splice(index, 1);
        delete this.mapping[key];
        return previous;
    }
}

export interface ReadonlyHashMap<K, V> {
    readonly size: number;
    has(key: K): boolean;
    get(key: K): V | undefined;
    forEach(callback: (value: V, key: K, map: ReadonlyHashMap<K, V>) => void): void;
    clone(): HashMap<K, V>;
}

export class HashMap<K, V> implements ReadonlyHashMap<K, V> {
    private readonly map = new Map<number, Array<{ key: K; value: V }>>();
    private _size = 0;

    constructor(
        private hashCode: (key: K) => number,
        private equals: (k1: K, k2: K) => boolean,
    ) {}

    get size() {
        return this._size;
    }

    has(key: K): boolean {
        const items = this.map.get(this.hashCode(key));
        if (!items) { return false; }
        return Boolean(items.find(p => this.equals(p.key, key)));
    }

    get(key: K): V | undefined {
        const items = this.map.get(this.hashCode(key));
        if (!items) { return undefined; }
        const pair = items.find(p => this.equals(p.key, key));
        return pair ? pair.value : undefined;
    }

    set(key: K, value: V): this {
        const hash = this.hashCode(key);
        let items = this.map.get(hash);
        if (items) {
            const index = items.findIndex(p => this.equals(p.key, key));
            if (index >= 0 && index !== items.length - 1) {
                items.splice(index, 1);
            } else {
                this._size++;
            }
            items.push({key, value});
        } else {
            items = [{key, value}];
            this.map.set(hash, items);
            this._size++;
        }
        return this;
    }

    delete(key: K): boolean {
        const items = this.map.get(this.hashCode(key));
        if (!items) { return false; }
        const index = items.findIndex(p => this.equals(p.key, key));
        if (index >= 0) {
            items.splice(index, 1);
            this._size--;
            return true;
        } else {
            return false;
        }
    }

    clear(): void {
        this.map.clear();
        this._size = 0;
    }

    forEach(callback: (value: V, key: K, map: HashMap<K, V>) => void) {
        this.map.forEach(items => {
            for (const {key, value} of items) {
                callback(value, key, this);
            }
        });
    }

    clone(): HashMap<K, V> {
        const clone = new HashMap<K, V>(this.hashCode, this.equals);
        clone._size = this.size;
        this.map.forEach((value, key) => clone.map.set(key, [...value]));
        return clone;
    }
}
