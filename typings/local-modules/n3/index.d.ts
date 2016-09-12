declare module "n3" {
    class N3Parser {
        parse(string: string, callback: (error: any, triple: Triple | undefined, prefix: any) => any);
    }

    function Parser(): N3Parser; 

    interface Triple {
        subject: string;
        predicate: string;
        object: string;
    }
}
