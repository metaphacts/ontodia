export interface Neo4jElement {
    data: any;
    metadata: {
        id: number;
        labels: string[];
    };
    self: string;
}

export type ElementBinding = [
    Neo4jElement
]

export type ClassBinding = [
    string[], // labels
    number    // count
];

export type LinkBinding = [
    string, // type
    number, // source
    number  // target
];

export type LinkTypeBinding = [
    string,  // LinkTypeId
    number   // Link count
];

export interface Neo4jResponse<Binding> {
    columns: string[];
    data: Binding[];
}
