import { uniqueId } from 'lodash';

export function htmlToSvg(htmlView: Node, blackList?: string[], mockImages?: boolean) {
    blackList = blackList || [];
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const primitives = breakIntoPrimitives(htmlView);

    for (const primitive of primitives) {
        const id = primitive.getAttribute('id');

        if (!id) {
            g.appendChild(primitive);
        } else {
            primitive.removeAttribute('id');

            const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
            clipPath.setAttribute('id', id);

            clipPath.appendChild(primitive);
            defs.appendChild(clipPath);
        }
    }
    g.appendChild(defs);

    return g;

    function breakIntoPrimitives(domElement: Node): SVGGElement[] {
        if (domElement instanceof Element) {
            if (domElement instanceof HTMLImageElement) {
                return !mockImages ? processImage(domElement) : processElement(domElement);
            } else if (domElement instanceof HTMLElement) {
                return processElement(domElement);
            }
        } else if (domElement instanceof Text) {
            return processText(domElement);
        }
        return [];
    }

    function processImage(htmlElement: HTMLImageElement): SVGGElement[] {
        const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');

        // Process current node
        const style = window.getComputedStyle(htmlElement);
        const offsetTop = getOffsetTop(htmlElement);
        const offsetLeft = getOffsetLeft(htmlElement);
        const width = style.width;
        const height = style.height;

        // path.setAttribute('className', htmlElement.className);
        image.setAttribute('stroke', style.borderColor);
        image.setAttribute('stroke-width', style.borderWidth);
        image.setAttribute('x', `${offsetLeft}`);
        image.setAttribute('y', `${offsetTop}`);
        image.setAttribute('width', `${width}`);
        image.setAttribute('height', `${height}`);
        image.setAttribute('href', htmlElement.getAttribute('src'));

        htmlElement.removeAttribute('crossorigin');

        return [image];
    }

    function processElement(htmlElement: HTMLElement): SVGGElement[] {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        let parts: SVGGElement[] = [];

        // Process children
        const contentSize = { width: 0, height: 0 };
        forEachNode(htmlElement.childNodes, child => {
            const nestedParts = breakIntoPrimitives(child);
            if (nestedParts.length > 0) {
                for (const p of nestedParts) {
                    const bbox = getElementBoundingBox(p);
                    contentSize.width = Math.max(contentSize.width, bbox.x + bbox.width);
                    contentSize.height = Math.max(contentSize.height, bbox.y + bbox.height);
                }
                parts = parts.concat(nestedParts);
            }
        });

        // Process current node
        const style = window.getComputedStyle(htmlElement);
        const y = getOffsetTop(htmlElement);
        const x = getOffsetLeft(htmlElement);
        const { width, height } = htmlElement.getBoundingClientRect();
        // const width = !style.width.endsWith('px') ? contentSize.width + 'px' : style.width;
        // const height = !style.width.endsWith('px') ? contentSize.height + 'px' : style.height;
        const radius = getBorderRadius(style);
        const borderColor = getBorderColor(style);
        const borderWidth = getBorderWidth(style);

        // path.setAttribute('className', htmlElement.className);
        path.setAttribute('fill', style.backgroundColor);
        path.setAttribute('stroke', borderColor);
        path.setAttribute('stroke-width', `${borderWidth}px`);
        // path.setAttribute('transform', `translate(${x}, ${y})`);
        path.setAttribute('x', `${x}`);
        path.setAttribute('y', `${y}`);
        path.setAttribute('width', `${width}`);
        path.setAttribute('height', `${height}`);
        path.setAttribute('d', generatePathData(
            x, y,
            width, height,
            radius[0], radius[1], radius[2], radius[3],
        ));

        // create mask if it's needed
        if (style.overflow === 'hidden' || style.overflow === 'auto') {
            const rect = createRect(x, y, width, height);
            const id = rect.getAttribute('id');
            parts.forEach(p => {
                if (!p.getAttribute('clip-path') && !p.getAttribute('id') && !(p instanceof SVGTextElement)) {
                    p.setAttribute('clip-path', `url(${'#' + id})`);
                }
            });
            parts.push(rect);
        }

        parts = [path as SVGGElement].concat(parts);
        return parts;
    }

    function processText(textElement: Text): SVGGElement[] {
        const parts: SVGGElement[] = [];
        const textContent = textElement.textContent.trim();
        if (textContent.length === 0 || !(textElement.parentNode instanceof Element)) {
            return [];
        }
        const parent = textElement.parentNode;
        const style = window.getComputedStyle(parent as Element);
        const x = getOffsetLeft(parent as HTMLElement);
        const y = getOffsetTop(parent as HTMLElement);
        const fill = style.color;
        const textSize = getTextSize(textContent, style.font);
        const prefferedWidth = stringToNumber(style.width);
        const lines = breakInLines(textContent, textSize, stringToNumber(style.width));

        lines.forEach((line, index) => {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');

            text.setAttribute('transform', `translate(${x}, ${y + index * textSize.height})`);
            text.setAttribute('x', `${0}`);
            text.setAttribute('y', `${0}`);
            // text.setAttribute('x', `${x}`);
            // text.setAttribute('y', `${y + index * textSize.height}`);
            text.setAttribute('width', `${prefferedWidth || textSize.width}`);
            text.setAttribute('height', `${textSize.height}`);
            text.setAttribute('fill', fill);
            text.setAttribute('font', style.font);
            // It's not working for IE11 (our main goal)
            // text.setAttribute('alignment-baseline', 'hanging');
            text.setAttribute('dy', `${textSize.height}`);
            text.textContent = line;

            parts.push(text);
        });

        return parts;
    }
}

function getBorderRadius(style: CSSStyleDeclaration): number[] {
    const radius = Math.round(stringToNumber(style.borderRadius.split(' ')[0])) || 0;
    return [
        Math.round(stringToNumber(style.borderTopLeftRadius)) || radius,
        Math.round(stringToNumber(style.borderTopRightRadius)) || radius,
        Math.round(stringToNumber(style.borderBottomRightRadius)) || radius,
        Math.round(stringToNumber(style.borderBottomLeftRadius)) || radius,
    ];
}

function getBorderColor(style: CSSStyleDeclaration): string {
    const color = style.borderColor.split(' ')[0];
    return style.borderTopColor ||
           style.borderRightColor ||
           style.borderBottomColor ||
           style.borderLeftColor || color || null;
}

function getBorderWidth(style: CSSStyleDeclaration): number {
    // const width = Math.round(stringToNumber(style.borderWidth.split(' ')[0]) || 0);

    const top = Math.round(stringToNumber(style.borderTopWidth) || 0);
    const right = Math.round(stringToNumber(style.borderRightWidth) || 0);
    const bottom = Math.round(stringToNumber(style.borderBottomWidth) || 0);
    const left = Math.round(stringToNumber(style.borderLeftWidth) || 0);

    return Math.min(top, right, bottom, left);
}

function createRect(
    x: number, y: number,
    width: number, height: number,
): SVGGElement {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('id', uniqueId('clip-rect-'));
    rect.setAttribute('x', `${x}`);
    rect.setAttribute('y', `${y}`);
    rect.setAttribute('width', `${width}px`);
    rect.setAttribute('height', `${height}px`);
    return rect;
}

function getOffsetTop(element: HTMLElement): number {
    if (element.className !== 'ontodia-overlayed-element') {
        return element.offsetTop +
            element.clientTop +
            (element.offsetParent && element.offsetParent instanceof HTMLElement ?
                getOffsetTop(element.offsetParent) : 0);
    } else {
        return 0;
    }
}

function getOffsetLeft(element: HTMLElement): number {
    if (element.className !== 'ontodia-overlayed-element') {
        return element.offsetLeft +
            element.clientLeft +
            (element.offsetParent && element.offsetParent instanceof HTMLElement ?
                getOffsetLeft(element.offsetParent) : 0);
    } else {
        return 0;
    }
}

function breakInLines(
    text: string,
    textSize: { width: number; height: number },
    prefferedWidth: number,
    elipsis?: boolean,
): string[] {
    const { width, height } = textSize;
    const lines: string[] = [];
    // breakText
    if (!prefferedWidth || width <= prefferedWidth) {
        lines.push(text);
    } else {
        const oneCharLength = width / text.length;
        const charsInLine = Math.floor(prefferedWidth / oneCharLength);
        if (elipsis) {
            const ELIPSIS_LENGTH = 3;
            lines.push(text.substring(0, charsInLine - ELIPSIS_LENGTH) + '...');
        } else {
            let c = 0;
            let line = '';
            for (let i = 0; i < text.length; i++, c++) {
                if (c >= charsInLine) {
                    lines.push(line);
                    line = '';
                    c = 0;
                }
                line += text[i];
            }
        }
    }
    return lines;
}

function getElementBoundingBox(element: (SVGGElement | SVGTextElement)) {
    return {
        x: stringToNumber(element.getAttribute('x')),
        y: stringToNumber(element.getAttribute('y')),
        width: stringToNumber(element.getAttribute('width')),
        height: stringToNumber(element.getAttribute('height')),
    };
}

/**
 * @param {string} text
 * @param {string} font
 */
function getTextSize(text: string, font: string) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = font;
    const fontSizeString = context.font.split(' ').filter(term => term.indexOf('px') !== -1)[0];
    const fontSize = +fontSizeString.substring(0, fontSizeString.length - 2);
    const metrics = context.measureText(text);
    return {
        width: metrics.width,
        height: fontSize,
    };
}

function forEachNode<T extends Node>(nodeList: NodeListOf<T>, callback: (node: T) => void) {
    for (let i = 0; i < nodeList.length; i++) {
        callback(nodeList[i]);
    }
}

function stringToNumber(value: string): number {
    const newValue = +cutExtension(value);
    return newValue;
}

const postfixes = ['px', 'vh', 'vw'];
function cutExtension(value: string): string {
    const lowerCaseValue = value.toLowerCase();
    if (postfixes.filter(
        postfix => lowerCaseValue.indexOf(postfix) !== -1,
    ).length > 0) {
        return value.substring(0, value.length - 2);
    } else {
        return value;
    }
}

/*
 * Generate a path's data attribute
 *
 * @param {Number} width Width of the rectangular shape
 * @param {Number} height Height of the rectangular shape
 * @param {Number} tr Top border radius of the rectangular shape
 * @param {Number} br Bottom border radius of the rectangular shape
 * @return {String} a path's data attribute value
 */
function generatePathData(
    x: number, y: number,
    width: number, height: number,
    tl: number, tr: number,
    br: number, bl: number,
) {
    const data = [];

    // start point in top-middle of the rectangle
    data.push('M' + (width / 2 + x) + ',' + y);

    // next we go to the right
    data.push('H' + (x + width - tr));

    if (tr > 0) {
        // now we draw the arc in the top-right corner
        data.push('A' + arcParameter(tr, tr, 0, 0, 1, x + width, y + tr));
    }

    // next we go down
    data.push('V' + (y + height - br));

    if (br > 0) {
        // now we draw the arc in the lower-right corner
        data.push('A' + arcParameter(br, br, 0, 0, 1, x + width - br, y + height));
    }

    // now we go to the left
    data.push('H' + (x + bl));

    if (bl > 0) {
        // now we draw the arc in the lower-left corner
        data.push('A' + arcParameter(bl, bl, 0, 0, 1, x, y + height - bl));
    }

    // next we go up
    data.push('V' + (y + tl));

    if (tl > 0) {
        // now we draw the arc in the top-left corner
        data.push('A' + arcParameter(tl, tl, 0, 0, 1, x + tl, y));
    }

    // and we close the path
    data.push('Z');

    return data.join(' ');
}

function arcParameter(
    rx: number, ry: number, xAxisRotation: number,
    largeArcFlag: number, sweepFlag: number,
    x: number, y: number,
) {
    return [
        rx, ',',
        ry, ' ',
        xAxisRotation, ' ',
        largeArcFlag, ',',
        sweepFlag, ' ',
        x, ',',
        y,
    ].join('');
}
