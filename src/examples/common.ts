import { LayoutData, SerializedDiagram, convertToSerializedDiagram, makeSerializedDiagram } from '../index';

export function onPageLoad(callback: (container: HTMLDivElement) => void) {
    document.addEventListener('DOMContentLoaded', () => {
        const container = document.createElement('div');
        container.id = 'root';
        document.body.appendChild(container);
        callback(container);
    });
}

export function tryLoadLayoutFromLocalStorage(): SerializedDiagram | undefined {
    if (window.location.hash.length > 1) {
        try {
            const key = window.location.hash.substring(1);
            const unparsedLayout = localStorage.getItem(key);
            const entry = unparsedLayout && JSON.parse(unparsedLayout);

            // backward compatibility test. If we encounder old diagram,
            // wrap it into Diagram interface, jsonld - pass through
            if (entry['@context']) {
                return entry;
            } else {
                return convertToSerializedDiagram({layoutData: entry, linkTypeOptions: []});
            }
        } catch (e) { /* ignore */ }
    }
    return undefined;
}

export function saveLayoutToLocalStorage(diagram: SerializedDiagram): string {
    const randomKey = Math.floor((1 + Math.random()) * 0x10000000000)
        .toString(16).substring(1);
    localStorage.setItem(randomKey, JSON.stringify(diagram));
    return randomKey;
}
