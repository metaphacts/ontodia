import * as _ from 'lodash';
import * as joint from 'jointjs';

export interface ToSVGOptions {
    preserveDimensions?: boolean;
    convertImagesToDataUris?: boolean;
    blacklistedCssAttributes?: string[];
    elementsToRemoveSelector?: string;
}

type Bounds = { width: number; height: number; };

export function toSVG(paper: joint.dia.Paper, opt: ToSVGOptions = {}): Promise<string> {
    const viewportTransform = paper.viewport.getAttribute('transform');
    paper.viewport.setAttribute('transform', '');

    const bbox = paper.getContentBBox();
    const {svgClone, imageBounds} = clonePaperSvg(paper);

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

    const nodes = svgClone.querySelectorAll('img');
    const convertImagesStartingAt = (index: number, done: () => void) => {
        if (index >= nodes.length) {
            done();
            return;
        }
        const img = nodes[index];
        const {width, height} = imageBounds[nodeRelativePath(svgClone, img)];
        img.setAttribute('width', width.toString());
        img.setAttribute('height', height.toString());
        if (opt.convertImagesToDataUris) {
            joint.util.imageToDataUri(img.src, (err, dataUri) => {
                // check for empty svg data URI which happens when mockJointXHR catches an exception
                if (dataUri && dataUri !== 'data:image/svg+xml,') { img.src = dataUri; }
                convertImagesStartingAt(index + 1, done);
            });
        } else {
            convertImagesStartingAt(index + 1, done);
        }
    };

    return new Promise<void>(resolve => {
        const mock = mockJointXHR();
        convertImagesStartingAt(0, () => {
            mock.dispose();
            resolve();
        });
    }).then(() => {
        const cssRuleTexts: string[] = [];
        for (let i = 0; i < document.styleSheets.length; i++) {
            let rules: CSSRuleList;
            try {
                const cssSheet = document.styleSheets[i] as CSSStyleSheet;
                rules = cssSheet.cssRules || cssSheet.rules;
                if (!rules) { continue; }
            } catch (e) { continue; }

            for (let j = 0; j < rules.length; j++) {
                const rule = rules[j];
                if (rule instanceof CSSStyleRule) {
                    cssRuleTexts.push(rule.cssText);
                }
            }
        }

        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        defs.innerHTML = `<style>${cssRuleTexts.join('\n')}</style>`;
        svgClone.insertBefore(defs, svgClone.firstChild);

        if (opt.elementsToRemoveSelector) {
            foreachNode(svgClone.querySelectorAll(opt.elementsToRemoveSelector),
                node => node.remove());
        }

        return new XMLSerializer().serializeToString(svgClone);
    });
}

function clonePaperSvg(paper: joint.dia.Paper): {
    svgClone: SVGElement;
    imageBounds: { [path: string]: Bounds };
} {
    const svgClone = paper.svg.cloneNode(true) as SVGElement;
    const imageBounds: { [path: string]: Bounds } = {};

    const cells: Backbone.Collection<joint.dia.Cell> = paper.model.get('cells');
    foreachNode(svgClone.querySelectorAll('g.element'), separatedView => {
        const modelId = separatedView.getAttribute('model-id');
        const overlayedView = (paper.el as HTMLElement).querySelector(
            `.ontodia-overlayed-element[model-id='${modelId}']`);
        if (!overlayedView) { return; }

        const newRoot = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
        const model = cells.get(modelId);
        const modelSize = model.get('size');
        newRoot.setAttribute('width', modelSize.width);
        newRoot.setAttribute('height', modelSize.height);
        const overlayedViewContent = overlayedView.firstChild as HTMLElement;
        newRoot.appendChild(overlayedViewContent.cloneNode(true));

        separatedView.setAttribute('class',
            `${separatedView.getAttribute('class')} ontodia-exported-element`);
        const oldRoot = separatedView.querySelector('.rootOfUI');
        const rootParent = oldRoot.parentElement;
        rootParent.removeChild(oldRoot);
        rootParent.appendChild(newRoot);

        foreachNode(overlayedViewContent.querySelectorAll('img'), img => {
            const rootPath = nodeRelativePath(svgClone, rootParent);
            const imgPath = nodeRelativePath(overlayedViewContent, img);
            // combine path "from SVG to root" and "from root to image"
            // with additional separator to consider newly added nodes
            imageBounds[rootPath + ':0:0:' + imgPath] = {
                width: img.clientWidth,
                height: img.clientHeight,
            };
        });
    });

    return {svgClone, imageBounds};
}

/**
 * Mock XMLHttpRequest for joint.util.imageToDataUri as workaround to uncatchable
 * DOMException in synchronous xhr.send() call when Joint trying to load SVG image.
 * 
 * @param onSyncSendError callback called on error
 */
function mockJointXHR(onSyncSendError?: (e: any) => void): { dispose: () => void } {
    try {
        const oldXHR = XMLHttpRequest;
        XMLHttpRequest = class {
            xhr = new oldXHR();
            responseText = '';
            open(...args: any[]) { this.xhr.open.apply(this.xhr, args); }
            send(...args: any[]) {
                try {
                    this.xhr.send.apply(this.xhr, args);
                } catch (e) {
                    if (onSyncSendError) { onSyncSendError(e); }
                }
            }
        } as any;
        let disposed = false;
        const dispose = () => {
            if (disposed) { return; }
            disposed = true;
            XMLHttpRequest = oldXHR;
        };
        return {dispose};
    } catch (e) {
        // do nothing if failed to mock XHR
        return {dispose: () => { /* nothing */ }};
    }
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
        while (sibling = sibling.previousSibling) {
            indexAtLevel++;
        }
        path.unshift(indexAtLevel);
        current = current.parentNode;
    }
    return path.join(':');
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
                dataURL = canvas.toDataURL(options.type, options.quality);
                resolve(dataURL);
            } catch (e) {
                reject(e);
                return;
            }
        };
        const svgOptions = _.clone(options.svgOptions || {convertImagesToDataUris: true});
        svgOptions.convertImagesToDataUris = true;
        toSVG(paper, svgOptions).then(svgString => {
            svgString = svgString
                .replace('width="100%"', 'width="' + contentWidth + '"')
                .replace('height="100%"', 'height="' + contentHeight + '"');
            img.src = 'data:image/svg+xml,' + encodeURIComponent(svgString);
        });
    });
}

export function fitRectKeepingAspectRatio(
    sourceWidth: number, sourceHeight: number,
    targetWidth: number, targetHeight: number
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
