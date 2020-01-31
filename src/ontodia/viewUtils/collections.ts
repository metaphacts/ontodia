export function objectValues<T>(obj: { [key: string]: T }): T[] {
    const items: T[] = [];
    for (const key in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, key)) { continue; }
        items.push(obj[key]);
    }
    return items;
}

export function isEmptyMap(map: object) {
    for (const key in map) {
        if (Object.prototype.hasOwnProperty.call(map, key)) { return false; }
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

export function getOrCreateArrayInMap<K, V>(map: Map<K, V[]>, key: K): V[] {
    let values = map.get(key);
    if (!values) {
        values = [];
        map.set(key, values);
    }
    return values;
}

export function getOrCreateSetInMap<K, V>(map: Map<K, Set<V>>, key: K): Set<V> {
    let values = map.get(key);
    if (!values) {
        values = new Set();
        map.set(key, values);
    }
    return values;
}

export class OrderedMap<V> {
    private mapping = new Map<string, V>();
    private ordered: V[] = [];

    reorder(compare: (a: V, b: V) => number) {
        this.ordered.sort(compare);
    }

    get items(): ReadonlyArray<V> {
        return this.ordered;
    }

    get(key: string): V | undefined {
        return this.mapping.get(key);
    }

    push(key: string, value: V) {
        if (this.mapping.has(key)) {
            const previous = this.mapping.get(key);
            if (previous === value) { return; }
            const index = this.ordered.indexOf(previous);
            this.ordered.splice(index, 1);
        }
        this.mapping.set(key, value);
        this.ordered.push(value);
    }

    delete(key: string): V | undefined {
        if (!this.mapping.has(key)) {
            return undefined;
        }
        const previous = this.mapping.get(key);
        const index = this.ordered.indexOf(previous);
        this.ordered.splice(index, 1);
        this.mapping.delete(key);
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
            if (index >= 0) {
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

export enum MoveDirection {
    ToStart = -1,
    ToEnd = 1,
}

export function makeMoveComparator<T>(
    items: ReadonlyArray<T>,
    selected: ReadonlyArray<T>,
    moveDirection: MoveDirection,
): (a: T, b: T) => number {
    const orderMap = new Map<T, number>();
    const selectionIndexOffset = moveDirection * items.length;

    items.forEach((item, index) => {
        orderMap.set(item, index);
    });

    for (const selectedItem of selected) {
        orderMap.set(selectedItem, selectionIndexOffset + orderMap.get(selectedItem));
    }

    return (a: T, b: T) => {
        const orderA = orderMap.get(a);
        const orderB = orderMap.get(b);
        return (
            orderA > orderB ? 1 :
            orderA < orderB ? -1 :
            0
        );
    };
}
