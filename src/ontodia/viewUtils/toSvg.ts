import { uniqueId } from 'lodash';

import { DiagramModel } from '../diagram/model';
import { Rect, boundsOf } from '../diagram/geometry';
import { isIE11 } from './polyfills';
import { htmlToSvg } from './htmlToSvg';

const ONTODIA_LOGO_SVG = require<string>('../../../images/ontodia-logo.svg');

type CanvgRender = (canvas: HTMLCanvasElement, svg: string, options?: CanvgOptions) => void;
interface CanvgOptions {
    offsetX?: number;
    offsetY?: number;
    scaleWidth?: number;
    scaleHeight?: number;
    ignoreDimensions?: boolean;
    ignoreClear?: boolean;
}
const canvg = require<CanvgRender>('canvg-fixed');

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
    mockImages?: boolean;
}

type Bounds = { width: number; height: number; };

/**
 * Padding (in px) for <foreignObject> elements of exported SVG to
 * mitigate issues with elements body overflow caused by missing styles
 * in exported image.
 */
const FOREIGN_OBJECT_SIZE_PADDING = 2;
const BORDER_PADDING = 100;

export function toSVG(options: ToSVGOptions): Promise<string> {
    return exportSVG(options).then(svg => new XMLSerializer().serializeToString(svg));
}

function exportSVG(options: ToSVGOptions): Promise<SVGElement> {
    const {contentBox: bbox} = options;
    const {svgClone, imageBounds} = clonePaperSvg(options, FOREIGN_OBJECT_SIZE_PADDING);
    if (isIE11()) { clearAttributes(svgClone); }

    if (options.preserveDimensions) {
        svgClone.setAttribute('width', bbox.width.toString());
        svgClone.setAttribute('height', bbox.height.toString());
    } else {
        svgClone.setAttribute('width', '100%');
        svgClone.setAttribute('height', '100%');
    }

    const viewBox: Rect = {
        x: bbox.x - BORDER_PADDING,
        y: bbox.y - BORDER_PADDING,
        width: bbox.width + BORDER_PADDING * 2,
        height: bbox.height + BORDER_PADDING * 2,
    };
    svgClone.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);

    addLogo(svgClone, viewBox);

    const images: HTMLImageElement[] = [];
    if (!isIE11()) {
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

        if (options.elementsToRemoveSelector) {
            foreachNode(svgClone.querySelectorAll(options.elementsToRemoveSelector),
                node => node.remove());
        }

        return svgClone;
    });
}

function addLogo(svg: SVGElement, viewBox: Rect) {
    const IMAGE_WIDTH = 150;
    const IMAGE_PADDING = 20;
    const size = svg.getBoundingClientRect();
    const image = document.createElementNS(SVG_NAMESPACE, 'image');
    image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', ONTODIA_LOGO_SVG);
    image.setAttribute('class', 'ontodia-logo-export');

    const imageRect: Rect = {
        x: viewBox.x + viewBox.width - IMAGE_PADDING - IMAGE_WIDTH,
        y: viewBox.y + IMAGE_PADDING,
        width: IMAGE_WIDTH,
        height: undefined,
    };

    image.setAttribute('x', imageRect.x.toString());
    image.setAttribute('y', imageRect.y.toString());
    image.setAttribute('width', imageRect.width.toString());
    image.setAttribute('opacity', '0.3');

    svg.insertBefore(image, svg.firstChild);
}

function clearAttributes(svg: SVGElement) {
    const availableIds: { [ key: string ]: boolean } = {};
    const prohibitedIds: { [ key: string ]: boolean } = {};
    const defss = svg.querySelectorAll('defs');
    foreachNode(defss, defs => {
        foreachNode(defs.childNodes, def => {
            const id = (def as SVGElement).getAttribute('id');
            if (id) {
                availableIds[id] = true;
                if (isIE11() && def instanceof SVGFilterElement) {
                    availableIds[id] = false;
                }
            }
        });
    });
    const paths = svg.querySelectorAll('*');
    foreachNode(paths, path => {
        const markerStart = extractId(path.getAttribute('marker-start'));
        if (markerStart && !availableIds[markerStart]) {
            path.removeAttribute('marker-start');
        }
        const markerEnd = extractId(path.getAttribute('marker-end'));
        if (markerEnd && !availableIds[markerEnd]) {
            path.removeAttribute('marker-end');
        }
        const filterId = extractId(path.getAttribute('filter'));
        if (filterId && !availableIds[filterId]) {
            path.removeAttribute('filter');
        }
    });

    function extractId(attributeValue: string) {
        if (attributeValue) {
            if (isIE11()) {
                return (attributeValue.match(/#(.*?)"/) || [])[1];
            } else {
                return (attributeValue.match(/#(.*?)\)/) || [])[1];
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
            if (child instanceof SVGGElement) { return child; }
            child = child.nextSibling;
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
        const overlayedViewContent = overlayedView.firstChild.cloneNode(true) as HTMLElement;
        elementRoot.setAttribute('class', 'ontodia-exported-element');

        let newRoot;
        if (isIE11()) {
            newRoot = htmlToSvg(overlayedView, [], options.mockImages);
        } else {
            newRoot = document.createElementNS(SVG_NAMESPACE, 'foreignObject');
            newRoot.appendChild(overlayedViewContent);
        }
        const {x, y, width, height} = boundsOf(element);
        newRoot.setAttribute('transform', `translate(${x},${y})`);
        newRoot.setAttribute('width', (width + elementSizePadding).toString());
        newRoot.setAttribute('height', (height + elementSizePadding).toString());

        elementRoot.appendChild(newRoot);
        viewport.appendChild(elementRoot);

        const originalNodes = (overlayedView.firstChild as HTMLElement).querySelectorAll('img');
        const clonedNodes = overlayedViewContent.querySelectorAll('img');

        foreachNode(overlayedView.querySelectorAll('img'), (img, index) => {
            const exportKey = uniqueId('export-key-');
            clonedNodes[index].setAttribute('export-key', exportKey);
            imageBounds[exportKey] = {
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

function foreachNode<T extends Node>(nodeList: NodeListOf<T>, callback: (node?: T, index?: number) => void) {
    for (let i = 0; i < nodeList.length; i++) {
        callback(nodeList[i], i);
    }
}

export interface ToDataURLOptions {
    /** 'image/png' | 'image/jpeg' | ... */
    mimeType?: string;
    width?: number;
    height?: number;
    /** Background color, transparent by default. */
    backgroundColor?: string;
    quality?: number;
}

const MAX_CANVAS_LENGTH = 4096;

export function toDataURL(options: ToSVGOptions & ToDataURLOptions): Promise<string> {
    return Promise.resolve().then(() => {
        const {paper, contentBox, mimeType = 'image/png'} = options;

        const containerSize = (typeof options.width === 'number' || typeof options.height === 'number')
            ? {width: options.width, height: options.height}
            : fallbackContainerSize(contentBox);

        const {innerSize, outerSize, offset} = computeAutofit(contentBox, containerSize);

        const svgOptions = {
            ...options,
            convertImagesToDataUris: true,
            mockImages: isIE11(),
            preserveDimensions: true,
        };

        const exportedTask = exportSVG(svgOptions).then(svg => {
            // make image centered when rendering using Canvg
            svg.setAttribute('width', innerSize.width.toString());
            svg.setAttribute('height', innerSize.height.toString());
            return new XMLSerializer().serializeToString(svg);
        });

        const {canvas, context} = createCanvas(
            outerSize.width,
            outerSize.height,
            options.backgroundColor,
        );

        if (isIE11()) {
            if (!canvg) {
                const error = new Error('"canvg-fixed" dependency required to support exporting in the IE.');
                console.error(error);
                throw error;
            }
            return exportedTask.then(svgString => {
                canvg(canvas, svgString, {
                    offsetX: offset.x,
                    offsetY: offset.y,
                    scaleWidth: innerSize.width,
                    scaleHeight: innerSize.height,
                    ignoreDimensions: true,
                    ignoreClear: true,
                });
                return canvas.toDataURL(mimeType, options.quality);
            });
        } else {
            return exportedTask
                .then(svgString => {
                    return loadImage('data:image/svg+xml,' + encodeURIComponent(svgString));
                })
                .then(image => {
                    context.drawImage(image, offset.x, offset.y, innerSize.width, innerSize.height);
                    return canvas.toDataURL(mimeType, options.quality);
                });
        }

        function createCanvas(canvasWidth: number, canvasHeight: number, backgroundColor?: string) {
            const cnv = document.createElement('canvas');
            cnv.width = canvasWidth;
            cnv.height = canvasHeight;
            const cnt = cnv.getContext('2d');
            if (backgroundColor) {
                cnt.fillStyle = backgroundColor;
                cnt.fillRect(0, 0, canvasWidth, canvasHeight);
            }
            return {canvas: cnv, context: cnt};
        }
    });
}

export function loadImage(source: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = function () {
            resolve(image);
        };
        image.onerror = function (ev: ErrorEvent) {
            reject(ev);
        };
        image.src = source;
    });
}

function computeAutofit(itemSize: Bounds, containerSize: Bounds) {
    const fit = fitRectKeepingAspectRatio(
        itemSize.width,
        itemSize.height,
        containerSize.width,
        containerSize.height,
    );
    const innerSize: Bounds = {
        width: Math.floor(fit.width),
        height: Math.floor(fit.height),
    };
    const outerSize: Bounds = {
        width: typeof containerSize.width === 'number' ? containerSize.width : innerSize.width,
        height: typeof containerSize.height === 'number' ? containerSize.height : innerSize.height,
    };
    const offset = {
        x: Math.round((outerSize.width - innerSize.width) / 2),
        y: Math.round((outerSize.height - innerSize.height) / 2),
    };
    return {innerSize, outerSize, offset};
}

function fallbackContainerSize(itemSize: Bounds): Bounds {
    const maxResolutionScale = Math.min(
        MAX_CANVAS_LENGTH / itemSize.width,
        MAX_CANVAS_LENGTH / itemSize.height,
    );
    const resolutionScale = Math.min(2.0, maxResolutionScale);
    const width = Math.floor(itemSize.width * resolutionScale);
    const height = Math.floor(itemSize.height * resolutionScale);
    return {width, height};
}

export function fitRectKeepingAspectRatio(
    sourceWidth: number,
    sourceHeight: number,
    targetWidth: number | undefined,
    targetHeight: number | undefined,
): { width: number; height: number; } {
    if (!(typeof targetWidth === 'number' || typeof targetHeight === 'number')) {
        return {width: sourceWidth, height: sourceHeight};
    }
    const sourceAspectRatio = sourceWidth / sourceHeight;
    targetWidth = typeof targetWidth === 'number' ? targetWidth : targetHeight * sourceAspectRatio;
    targetHeight = typeof targetHeight === 'number' ? targetHeight : targetWidth / sourceAspectRatio;
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
