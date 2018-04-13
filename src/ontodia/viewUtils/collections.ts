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

export class OrderedMap<V> {
    private mapping: { [key: string]: V };
    private ordered: V[];

    constructor()
    constructor(values: ReadonlyArray<V>, getKey: (value: V) => string)
    constructor(values?: ReadonlyArray<V>, getKey?: (value: V) => string) {
        this.mapping = createStringMap<V>();
        this.ordered = [];
        if (values) {
            for (const value of values) {
                this.push(getKey(value), value);
            }
        }
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
