declare module "n3" {
    class N3Parser {
        parse(
            string: string,
            callback: (error: any, triple: Triple | undefined, prefix: any) => any
        ): void;
    }

    function Parser(): N3Parser;

    interface Triple {
        subject: string;
        predicate: string;
        object: string;
    }

    namespace Util {
        function isLiteral(value: string): boolean;
        function getLiteralValue(value: string): string;
        function getLiteralType(value: string): string;
        function getLiteralLanguage(value: string): string;
    }
}
