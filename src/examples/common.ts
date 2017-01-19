import { LayoutData } from '../index';

export function onPageLoad(callback: (container: HTMLDivElement) => void) {
    document.addEventListener('DOMContentLoaded', () => {
        const container = document.createElement('div');
        container.id = 'root';
        document.body.appendChild(container);
        callback(container);
    });
}

export function tryLoadLayoutFromLocalStorage(): LayoutData | undefined {
    if (window.location.hash.length > 1) {
        try {
            const key = window.location.hash.substring(1);
            const unparsedLayout = localStorage.getItem(key);
            return unparsedLayout && JSON.parse(unparsedLayout);
        } catch (e) { /* ignore */ }
    }
    return undefined;
}

export function saveLayoutToLocalStorage(layout: LayoutData): string {
    const randomKey = Math.floor((1 + Math.random()) * 0x10000000000)
        .toString(16).substring(1);
    localStorage.setItem(randomKey, JSON.stringify(layout));
    return randomKey;
}
