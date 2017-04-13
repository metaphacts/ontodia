export interface ElementBinding {
    0: {    // Element
        data: any;
        metadata: {
            id: number;
            labels: string[];
        };
        self: string
    };
}

export interface ClassBinding {
    0: string[]; // labels
    1: number;   // count
}

export interface LinkBinding {
    0: string;  // type
    1: number;  // source
    2: number;   // target
}

export interface LinkTypeBinding {
    0: string;  // LinkTypeId
    1: number;  // Link count
}

export interface Neo4jResponse<Binding> {
    columns: string[];
    data: Binding[];
}
