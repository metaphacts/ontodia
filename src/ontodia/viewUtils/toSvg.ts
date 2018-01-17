import * as _ from 'lodash';
import * as joint from 'jointjs';

import { isIE11 } from './detectBrowser';
import { htmlToSvg } from './htmlToSvg';

const canvg = require<(canvas: HTMLCanvasElement, svg: string) => void>('canvg-fixed');

export interface ToSVGOptions {
    preserveDimensions?: boolean;
    convertImagesToDataUris?: boolean;
    blacklistedCssAttributes?: string[];
    elementsToRemoveSelector?: string;
    mockImages?: boolean;
}

type Bounds = { width: number; height: number; };

/**
 * Padding (in px) for <foreignObject> elements of exported SVG to
 * mitigate issues with elements body overflow caused by missing styles
 * in exported image.
 */
const ForeignObjectSizePadding = 2;

export function toSVG(paper: joint.dia.Paper, opt: ToSVGOptions = {}): Promise<string> {
    const viewportTransform = paper.viewport.getAttribute('transform');
    paper.viewport.setAttribute('transform', '');

    const bbox = paper.getContentBBox();
    const {svgClone, imageBounds} = clonePaperSvg(paper, ForeignObjectSizePadding, opt.mockImages);

    paper.viewport.setAttribute('transform', viewportTransform || '');

    svgClone.removeAttribute('style');
    if (opt.preserveDimensions) {
        svgClone.setAttribute('width', bbox.width.toString());
        svgClone.setAttribute('height', bbox.height.toString());
    } else {
        svgClone.setAttribute('width', '100%');
        svgClone.setAttribute('height', '100%');
    }
    svgClone.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);

    const images: HTMLImageElement[] = [];
    if (!isIE11) {
        const nodes = svgClone.querySelectorAll('img');
        foreachNode(nodes, node => images.push(node));
    }

    const convertingImages = Promise.all(images.map(img => {
        const exportKey = img.getAttribute('export-key');
        img.removeAttribute('export-key');
        if (exportKey) {
            const {width, height} = imageBounds[exportKey];
            img.setAttribute('width', width.toString());
            img.setAttribute('height', height.toString());
            if (!opt.convertImagesToDataUris) {
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
        } else {
            return Promise.resolve();
        }
    }));

    return convertingImages.then(() => {
        // workaround to include only ontodia-related stylesheets
        const cssTexts = extractCSSFromDocument(text => text.indexOf('.ontodia') >= 0);

        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        defs.innerHTML = `<style>${cssTexts.join('\n')}</style>`;
        svgClone.insertBefore(defs, svgClone.firstChild);

        if (opt.elementsToRemoveSelector) {
            foreachNode(svgClone.querySelectorAll(opt.elementsToRemoveSelector),
                node => {
                    node.parentNode.removeChild(node);
                });
        }

        return new XMLSerializer().serializeToString(svgClone);
    });
}

function clearMarkers(svg: SVGElement) {
    const availableIds: { [ key: string ]: boolean } = {};
    const defss = svg.querySelectorAll('defs');
    foreachNode(defss, defs => {
        foreachNode(defs.childNodes, def => {
            availableIds[(def as SVGElement).getAttribute('id')] = true;
        });
    });
    const paths = svg.querySelectorAll('path');
    foreachNode(paths, path => {
        const markerStart = extractId(path.getAttribute('marker-start'));
        if (markerStart && !availableIds[markerStart]) {
            path.removeAttribute('marker-start');
        }
        const markerEnd = extractId(path.getAttribute('marker-end'));
        if (markerEnd && !availableIds[markerEnd]) {
            path.removeAttribute('marker-end');
        }
    });

    function extractId(attributeValue: string) {
        if (attributeValue) {
            if (!isIE11) {
                return (attributeValue.match(/#(.*?)\)/) || [])[1];
            } else {
                return (attributeValue.match(/#(.*?)"/) || [])[1];
            }
        } else {
            return undefined;
        }
    }
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

function clonePaperSvg(paper: joint.dia.Paper, elementSizePadding: number, mockImages: boolean): {
    svgClone: SVGElement;
    imageBounds: { [path: string]: Bounds };
} {
    const svgClone = paper.svg.cloneNode(true) as SVGElement;
    clearMarkers(svgClone);
    const imageBounds: { [path: string]: Bounds } = {};

    const cells: Backbone.Collection<joint.dia.Cell> = paper.model.get('cells');
    foreachNode(svgClone.querySelectorAll('g.element'), separatedView => {
        const modelId = separatedView.getAttribute('model-id');
        const overlayedView = (paper.el as HTMLElement).querySelector(
            `.ontodia-overlayed-element[model-id='${modelId}']`);
        if (!overlayedView) { return; }

        const overlayedViewContent = overlayedView.firstChild.cloneNode(true) as HTMLElement;
        let newRoot;
        if (!isIE11()) {
            newRoot = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
            const model = cells.get(modelId);
            const modelSize = model.get('size');
            newRoot.setAttribute('width', modelSize.width + elementSizePadding);
            newRoot.setAttribute('height', modelSize.height + elementSizePadding);
            newRoot.appendChild(overlayedViewContent);

            separatedView.setAttribute('class',
                `${separatedView.getAttribute('class')} ontodia-exported-element`);
        } else {
            newRoot = htmlToSvg(overlayedView.firstChild, [], mockImages);
        }
        const oldRoot = separatedView.querySelector('.rootOfUI');
        const rootParent = oldRoot.parentElement || oldRoot.parentNode;
        rootParent.removeChild(oldRoot);
        rootParent.appendChild(newRoot);

        const originalNodes = (overlayedView.firstChild as HTMLElement).querySelectorAll('img');
        const clonedNodes = overlayedViewContent.querySelectorAll('img');

        foreachNode(originalNodes, (img, index) => {
            const exportKey = _.uniqueId('export-key-');
            clonedNodes[index].setAttribute('export-key', exportKey);
            imageBounds[exportKey] = {
                width: img.clientWidth,
                height: img.clientHeight,
            };
        });
    });

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

function foreachNode<T extends Node>(nodeList: NodeListOf<T>, callback: (node?: T, index?: number) => void) {
    for (let i = 0; i < nodeList.length; i++) {
        callback(nodeList[i], i);
    }
}

export interface ToDataURLOptions {
    /** 'image/png' | 'image/jpeg' | ... */
    type?: string;
    width?: number;
    height?: number;
    padding?: number;
    backgroundColor?: string;
    quality?: number;
    svgOptions?: ToSVGOptions;
}

export function toDataURL(paper: joint.dia.Paper, options?: ToDataURLOptions): Promise<string> {
    return new Promise((resolve, reject) => {
        options = options || {};
        options.type = options.type || 'image/png';

        let imageRect: Bounds;
        let contentHeight: number;
        let contentWidth: number;
        let padding = options.padding || 0;

        const clientRect = paper.viewport.getBoundingClientRect();
        imageRect = fitRectKeepingAspectRatio(
            clientRect.width || 1, clientRect.height || 1,
            options.width, options.height);

        padding = Math.min(padding, imageRect.width / 2 - 1, imageRect.height / 2 - 1);
        contentWidth = imageRect.width - 2 * padding;
        contentHeight = imageRect.height - 2 * padding;

        const img = new Image();

        const svgOptions = _.clone(options.svgOptions || {convertImagesToDataUris: true});
        svgOptions.convertImagesToDataUris = true;
        if (!isIE11()) {
            img.onload = function () {
                const { canvas, context } = createCanvas();
                try {
                    context.drawImage(img, padding, padding, contentWidth, contentHeight);
                    resolve(canvas.toDataURL(options.type, options.quality));
                } catch (e) {
                    reject(e);
                    return;
                }
            };
            toSVG(paper, svgOptions).then(svgString => {
                svgString = svgString
                    .replace('width="100%"', 'width="' + contentWidth + '"')
                    .replace('height="100%"', 'height="' + contentHeight + '"');
                img.src = 'data:image/svg+xml,' + encodeURIComponent(svgString);
            });
        } else {
            svgOptions.mockImages = true;
            toSVG(paper, svgOptions).then(svgString => {
                const { canvas, context } = createCanvas();
                svgString = svgString
                    .replace('width="100%"', 'width="' + contentWidth + '"')
                    .replace('height="100%"', 'height="' + contentHeight + '"');
                canvg(canvas, svgString);
                resolve(canvas.toDataURL(options.type, options.quality));
            });
        }

        function createCanvas() {
            const canvas = document.createElement('canvas');
            canvas.width = imageRect.width;
            canvas.height = imageRect.height;
            const context = canvas.getContext('2d');
            context.fillStyle = options.backgroundColor || 'white';
            context.fillRect(0, 0, imageRect.width, imageRect.height);
            return { canvas, context };
        }

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
