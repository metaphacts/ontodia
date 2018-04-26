declare module 'file-saverjs' {
    const saveAs: {
        (file: Blob, fileName: string): void;
    };
    export = saveAs;
}
