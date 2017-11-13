import * as _ from 'lodash';
import * as joint from 'jointjs';

import { DiagramModel } from '../diagram/model';
import { Rect, boundsOf } from '../diagram/geometry';
import { isIE11 } from './detectBrowser';

const SVG_NAMESPACE: 'http://www.w3.org/2000/svg' = 'http://www.w3.org/2000/svg';

export interface ToSVGOptions {
    model: DiagramModel;
    paper: SVGSVGElement;
    contentBox: Rect;
    getOverlayedElement: (id: string) => HTMLElement;
    preserveDimensions?: boolean;
    convertImagesToDataUris?: boolean;
    blacklistedCssAttributes?: string[];
    elementsToRemoveSelector?: string;
}

type Bounds = { width: number; height: number; };

/**
 * Padding (in px) for <foreignObject> elements of exported SVG to
 * mitigate issues with elements body overflow caused by missing styles
 * in exported image.
 */
const ForeignObjectSizePadding = 2;

export function toSVG(options: ToSVGOptions): Promise<string> {
    if (isIE11()) {
        return Promise.reject(new Error(
            'Export to SVG is not supported in the Internet Explorer'));
    }

    const {contentBox: bbox} = options;
    const {svgClone, imageBounds} = clonePaperSvg(options, ForeignObjectSizePadding);

    if (options.preserveDimensions) {
        svgClone.setAttribute('width', bbox.width.toString());
        svgClone.setAttribute('height', bbox.height.toString());
    } else {
        svgClone.setAttribute('width', '100%');
        svgClone.setAttribute('height', '100%');
    }
    svgClone.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);

    const nodes = svgClone.querySelectorAll('img');
    const images: HTMLImageElement[] = [];
    foreachNode(nodes, node => images.push(node));

    const convertingImages = Promise.all(images.map(img => {
        const {width, height} = imageBounds[nodeRelativePath(svgClone, img)];
        img.setAttribute('width', width.toString());
        img.setAttribute('height', height.toString());
        if (!options.convertImagesToDataUris) {
            return Promise.resolve();
        }
        return exportAsDataUri(img).then(dataUri => {
            // check for empty svg data URI which happens when mockJointXHR catches an exception
            if (dataUri && dataUri !== 'data:image/svg+xml,') {
                img.src = dataUri;
            }
        }).catch(err => {
            console.warn('Failed to export image: ' + img.src);
            console.warn(err);
        });
    }));

    return convertingImages.then(() => {
        // workaround to include only ontodia-related stylesheets
        const cssTexts = extractCSSFromDocument(text => text.indexOf('.ontodia') >= 0);

        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        defs.innerHTML = `<style>${cssTexts.join('\n')}</style>`;
        svgClone.insertBefore(defs, svgClone.firstChild);

        if (options.elementsToRemoveSelector) {
            foreachNode(svgClone.querySelectorAll(options.elementsToRemoveSelector),
                node => node.remove());
        }

        return new XMLSerializer().serializeToString(svgClone);
    });
}

function extractCSSFromDocument(shouldInclude: (cssText: string) => boolean): string[] {
    const cssTexts: string[] = [];
    for (let i = 0; i < document.styleSheets.length; i++) {
        let rules: CSSRuleList;
        try {
            const cssSheet = document.styleSheets[i] as CSSStyleSheet;
            rules = cssSheet.cssRules || cssSheet.rules;
            if (!rules) { continue; }
        } catch (e) { continue; }

        const ruleTexts: string[] = [];
        let allowToInclude = false;

        for (let j = 0; j < rules.length; j++) {
            const rule = rules[j];
            if (rule instanceof CSSStyleRule) {
                const text = rule.cssText;
                ruleTexts.push(rule.cssText);
                if (shouldInclude(text)) {
                    allowToInclude = true;
                }
            }
        }

        if (allowToInclude) {
            cssTexts.push(ruleTexts.join('\n'));
        }
    }
    return cssTexts;
}

function clonePaperSvg(options: ToSVGOptions, elementSizePadding: number): {
    svgClone: SVGElement;
    imageBounds: { [path: string]: Bounds };
} {
    const {model, paper, getOverlayedElement} = options;
    const svgClone = paper.cloneNode(true) as SVGSVGElement;
    svgClone.removeAttribute('class');
    svgClone.removeAttribute('style');

    function findViewport() {
        let child = svgClone.firstChild;
        while (child) {
            child = child.nextSibling;
            if (child instanceof SVGGElement) { return child; }
        }
        return undefined;
    }

    const viewport = findViewport();
    viewport.removeAttribute('transform');

    const imageBounds: { [path: string]: Bounds } = {};

    for (const element of model.elements) {
        const modelId = element.id;
        const overlayedView = getOverlayedElement(modelId);
        if (!overlayedView) { continue; }

        const elementRoot = document.createElementNS(SVG_NAMESPACE, 'g');
        elementRoot.setAttribute('class', 'ontodia-exported-element');

        const newRoot = document.createElementNS(SVG_NAMESPACE, 'foreignObject');
        const {x, y, width, height} = boundsOf(element);
        newRoot.setAttribute('transform', `translate(${x},${y})`);
        newRoot.setAttribute('width', (width + elementSizePadding).toString());
        newRoot.setAttribute('height', (height + elementSizePadding).toString());
        const overlayedViewContent = overlayedView.firstChild as HTMLElement;
        newRoot.appendChild(overlayedViewContent.cloneNode(true));

        elementRoot.appendChild(newRoot);
        viewport.appendChild(elementRoot);

        foreachNode(overlayedViewContent.querySelectorAll('img'), img => {
            const rootPath = nodeRelativePath(svgClone, elementRoot);
            const imgPath = nodeRelativePath(overlayedViewContent, img);
            // combine path "from SVG to root" and "from root to image"
            // with additional separator to consider newly added nodes
            imageBounds[rootPath + ':0:0:' + imgPath] = {
                width: img.clientWidth,
                height: img.clientHeight,
            };
        });
    }

    return {svgClone, imageBounds};
}

function exportAsDataUri(original: HTMLImageElement): Promise<string> {
    const url = original.src;
    if (!url || url.startsWith('data:')) {
        return Promise.resolve(url);
    }

    return loadCrossOriginImage(original.src).then(image => {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;

        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);

        // match extensions like htttp://example.com/images/foo.JPG&w=200
        const extensionMatch = url.match(/\.([a-zA-Z0-9]+)[^\.a-zA-Z0-9]?[^\.]*$/);
        const extension = extensionMatch ? extensionMatch[1].toLowerCase() : 'png';

        try {
            const mimeType = 'image/' + (extension === 'jpg' ? 'jpeg' : extension);
            const dataUri = canvas.toDataURL(mimeType);
            return Promise.resolve(dataUri);
        } catch (e) {
            if (extension !== 'svg') {
                return Promise.reject('Failed to convert image to data URI');
            }
            return fetch(url)
                .then(response => response.text())
                .then(svg => svg.length > 0 ? ('data:image/svg+xml,' + encodeURIComponent(svg)) : '');
        }
    });
}

function loadCrossOriginImage(src: string): Promise<HTMLImageElement> {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
        image.onload = () => resolve(image);
        image.onerror = ev => reject(ev.error);
    });
    image.src = src;
    return promise;
}

function foreachNode<T extends Node>(nodeList: NodeListOf<T>, callback: (node: T) => void) {
    for (let i = 0; i < nodeList.length; i++) {
        callback(nodeList[i]);
    }
}

/**
 * Returns colon-separeted path from `parent` to `child` where each part
 * corresponds to child index at each tree level.
 *
 * @example
 * <div id='root'>
 *   <span></span>
 *   <ul>
 *     <li id='target'></li>
 *     <li></li>
 *   </ul>
 * </div>
 *
 * nodeRelativePath(root, target) === '1:0'
 */
function nodeRelativePath(parent: Node, child: Node) {
    const path: number[] = [];
    let current = child;
    while (current && current !== parent) {
        let sibling = current;
        let indexAtLevel = 0;
        while (true) {
            sibling = sibling.previousSibling;
            if (!sibling) { break; }
            indexAtLevel++;
        }
        path.unshift(indexAtLevel);
        current = current.parentNode;
    }
    return path.join(':');
}

export interface ToDataURLOptions {
    /** 'image/png' | 'image/jpeg' | ... */
    mimeType?: string;
    width?: number;
    height?: number;
    padding?: number;
    backgroundColor?: string;
    quality?: number;
}

export function toDataURL(options: ToSVGOptions & ToDataURLOptions): Promise<string> {
    return new Promise((resolve, reject) => {
        const {paper, contentBox, mimeType = 'image/png'} = options;

        const imageRect: Bounds = fitRectKeepingAspectRatio(
            contentBox.width, contentBox.height,
            options.width, options.height,
        );

        let padding = options.padding || 0;
        padding = Math.min(padding, imageRect.width / 2 - 1, imageRect.height / 2 - 1);

        const contentWidth = imageRect.width - 2 * padding;
        const contentHeight = imageRect.height - 2 * padding;

        const img = new Image();
        img.onload = function () {
            let dataURL: string;
            let context: CanvasRenderingContext2D;
            let canvas: HTMLCanvasElement;

            function createCanvas() {
                canvas = document.createElement('canvas');
                canvas.width = imageRect.width;
                canvas.height = imageRect.height;
                context = canvas.getContext('2d');
                context.fillStyle = options.backgroundColor || 'white';
                context.fillRect(0, 0, imageRect.width, imageRect.height);
            }

            createCanvas();
            try {
                context.drawImage(img, padding, padding, contentWidth, contentHeight);
                dataURL = canvas.toDataURL(mimeType, options.quality);
                resolve(dataURL);
            } catch (e) {
                reject(e);
                return;
            }
        };
        const svgOptions = {...options, convertImagesToDataUris: true};
        toSVG(svgOptions).then(svgString => {
            svgString = svgString
                .replace('width="100%"', 'width="' + contentWidth + '"')
                .replace('height="100%"', 'height="' + contentHeight + '"');
            img.src = 'data:image/svg+xml,' + encodeURIComponent(svgString);
        });
    });
}

export function fitRectKeepingAspectRatio(
    sourceWidth: number, sourceHeight: number,
    targetWidth: number, targetHeight: number,
): { width: number; height: number; } {
    if (!targetWidth && !targetHeight) {
        return {width: sourceWidth, height: sourceHeight};
    }
    const sourceAspectRatio = sourceWidth / sourceHeight;
    targetWidth = targetWidth || targetHeight * sourceAspectRatio;
    targetHeight = targetHeight || targetWidth / sourceAspectRatio;
    if (targetHeight * sourceAspectRatio <= targetWidth) {
        return {width: targetHeight * sourceAspectRatio, height: targetHeight};
    } else {
        return {width: targetWidth, height: targetWidth / sourceAspectRatio};
    }
}

/**
 * Creates and returns a blob from a data URL (either base64 encoded or not).
 *
 * @param {string} dataURL The data URL to convert.
 * @return {Blob} A blob representing the array buffer data.
 */
export function dataURLToBlob(dataURL: string): Blob {
    const BASE64_MARKER = ';base64,';
    if (dataURL.indexOf(BASE64_MARKER) === -1) {
        const parts = dataURL.split(',');
        const contentType = parts[0].split(':')[1];
        const raw = decodeURIComponent(parts[1]);

        return new Blob([raw], {type: contentType});
    }

    const parts = dataURL.split(BASE64_MARKER);
    const contentType = parts[0].split(':')[1];
    const raw = window.atob(parts[1]);
    const rawLength = raw.length;

    const uInt8Array = new Uint8Array(rawLength);

    for (let i = 0; i < rawLength; ++i) {
        uInt8Array[i] = raw.charCodeAt(i);
    }

    return new Blob([uInt8Array], {type: contentType});
}
