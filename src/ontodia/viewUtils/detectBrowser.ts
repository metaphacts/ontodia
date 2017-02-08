
export function isIE11() {
    return !((window as any).ActiveXObject) && 'ActiveXObject' in window;
}
