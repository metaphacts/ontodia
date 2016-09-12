import * as d3 from 'd3';
import * as Backbone from 'backbone';
import * as _ from 'lodash';
import * as $ from 'jquery';

function removeAllChilds(node: Element) {
    while (node.firstChild) {
        node.removeChild(node.firstChild);
    }
}

function setAsChild(parent: Element, node: Element, isNodeWillBeChild: boolean) {
    let currentlyIsChild = node.parentNode === parent;
    if (currentlyIsChild && !isNodeWillBeChild) {
        parent.removeChild(node);
    } else if (!currentlyIsChild && isNodeWillBeChild) {
        parent.appendChild(node);
    }
}

export interface Vector {
    x: number;
    y: number;
}

export function vector(x: number, y?: number): Vector {
    if (typeof y === 'undefined') { y = x; }
    return {x: x, y: y};
}

/**
 * Measures UIElement using UIElement.measure() method taking
 * it's margin, width and height fields into consideration.
 * @param element UIElement to measure
 * @param maxSize Maximum allowed size for element bounds including margin.
 *                Use Infinity to compute non-restricted element size.
 * @returns Measured size of element including margin.
 */
export function measure(element: UIElement, maxSize: Vector): Vector {
    let m: Margin = element.get('margin'),
        width: number = element.get('width'),
        height: number = element.get('height');
    let horizontalMargin = m.left + m.right;
    let verticalMargin = m.top + m.bottom;
    if (width && width < maxSize.x) { maxSize.x = width; }
    if (height && height < maxSize.y) { maxSize.y = height; }
    maxSize.x = Math.max(maxSize.x - m.left - m.right, 0);
    maxSize.y = Math.max(maxSize.y - m.top - m.bottom, 0);
    let size = element.measure(maxSize);
    // element size should be greater or equal to (width, height) if they're set
    if (width && size.x < width) { size.x = width; }
    if (height && size.y < height) { size.y = height; }
    element.size = size;
    if (height) { element.size.y = maxSize.y; }
    return vector(size.x + horizontalMargin, size.y + verticalMargin);
}

/**
 * Arranges UIElement by specified coordinates (x, y) and size taking
 * it's margin into consideration.
 */
export function arrange(element: UIElement, x: number, y: number, size?: Vector): void {
    if (typeof size === 'undefined') { size = element.size; }
    let m: Margin = element.get('margin');
    element.arrange(x + m.left, y + m.top, size);
}

export function sizeWithMargin(element: UIElement): Vector {
    let m: Margin = element.get('margin');
    return vector(
        element.size.x + m.left + m.right,
        element.size.y + m.top + m.bottom);
}

export interface Margin {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

/**
 * Base class of SVG UI elements.
 * Backbone properties:
 *     width: number
 *     height: number
 *     margin: svgui.Margin
 */
export abstract class UIElement extends Backbone.Model {
    /** Root SVG element of this UIElement */
    public root: d3.Selection<any>;
    /** Measured size of the element. */
    public size: Vector;
    constructor(attributes?, options?) {
        super(attributes, options);
    }
    defaults(): any {
        return {
            margin: {top: 0, right: 0, bottom: 0, left: 0},
        };
    }
    initialize(attributes?: any, options?: any) {
        let parent = attributes.parent;
        this.root = parent ? parent.append('g') : d3.select(
            document.createElementNS('http://www.w3.org/2000/svg', 'g'));
        super.initialize.apply(this, arguments);
    }
    /** Measures element without margin returning computed element size */
    abstract measure(maxSize: Vector): Vector;
    /** Arranges element without margin by coordinates (x, y) using provided size */
    abstract arrange(x: number, y: number, size: Vector): void;
}

/**
 * Text element with raze and line wrapping support.
 * Backbone properties:
 *     text: string
 *     textClass: string
 *     interline: number
 *     raze: boolean
 * Events:
 *     action:click
 */
export class Label extends UIElement {
    private ti: TextInfoResult;
    private iconSize: number;
    private textLines: string[];
    private hyperlink: WrappedHyperlink;
    defaults() {
        return _.extend(super.defaults(), {
            text: 'Label',
            textClass: 'svguiLabelText',
            interline: 3,
            raze: true,
        });
    }
    initialize() {
        super.initialize.apply(this, arguments);
        this.update();
    }
    update() {
        removeAllChilds(<Element>this.root.node());
        if (this.hyperlink) {
            this.hyperlink.parent.on('click.svguiLabel', null);
        }
        this.hyperlink = wrapHyperlink(this.root, this.get('text'));
        this.hyperlink.parent.on('click.svguiLabel', () => {
            d3.event.preventDefault();
            this.trigger('action:click');
        });
        this.ti = textInfo(this.hyperlink.text, this.get('textClass'));
        this.iconSize = this.hyperlink.icon != null ? this.ti.height : 0;
        return this;
    }
    measure(maxSize: Vector) {
        if (this.get('raze')) {
            return vector(Math.min(maxSize.x, this.ti.width + this.iconSize), this.ti.height);
        } else {
            this.textLines = splitIntoLines(
                (i) => maxSize.x - (i === 0 ? this.iconSize : 0),
                this.hyperlink.text, this.get('textClass'));
            const lineHeightSum = this.textLines.length * (this.ti.offsetY + this.get('interline'));
            let height = lineHeightSum - this.get('interline') + this.ti.baseLineHeight;
            let width = 0;
            for (let i = 0; i < this.textLines.length; i++) {
                let lineWidth = textInfo(this.textLines[i], this.get('textClass')).width;
                if (lineWidth > width) { width = lineWidth; }
            }
            return vector(width, height);
        }
    }
    arrange(x: number, y: number, size: Vector) {
        if (this.hyperlink.icon) {
            this.hyperlink.icon
                .attr('x', x + this.ti.height * 0.1)
                .attr('y', y + this.ti.height * 0.1)
                .attr('width', this.ti.height * 0.8)
                .attr('height', this.ti.height * 0.8);
        }
        this.hyperlink.parent.selectAll('text').remove();
        if (this.get('raze')) {
            let textElement = this.hyperlink.parent.append('text')
                .attr('width', size.x)
                .attr('y', y + this.ti.offsetY)
                .attr('x', x + this.iconSize)
                .attr('class', this.get('textClass'));
            razeText(textElement, this.hyperlink.text, this.get('textClass'), this.ti,
                Math.max(size.x - this.iconSize, 0), this.hyperlink.url);
        } else {
            for (let i = 0; i < this.textLines.length; i++) {
                let lineText = this.textLines[i];
                this.hyperlink.parent.append('text')
                    .attr('width', size.x)
                    .attr('y', y + this.ti.offsetY + (this.ti.offsetY + this.get('interline')) * i)
                    .attr('x', x + (i === 0 ? this.iconSize : 0))
                    .attr('class', this.get('textClass'))
                    .text(lineText);
            }
        }
    }
}

/*
 * Horizontal two column pair of elements.
 * Backbone properties:
 *     left: UIElement
 *     right: UIElement
 *     spacing: number
 */
export class Pair extends UIElement {
    get left(): UIElement { return this.get('left'); }
    get right(): UIElement { return this.get('right'); }
    get spacing(): number { return this.get('spacing'); }
    defaults() {
        return _.extend(super.defaults(), {
            left: undefined,
            right: undefined,
            spacing: 10,
        });
    }
    initialize() {
        super.initialize.apply(this, arguments);
        this.root.attr('class', 'svguiPair');
        this.update();
    }
    update() {
        return this;
    }
    measure(maxSize: Vector) {
        const leftSize = this.left ? measure(this.left, maxSize) : vector(0, 0);
        const rightSize = this.right ? measure(this.right, {
            x: maxSize.x - leftSize.x - this.spacing,
            y: maxSize.y,
        }) : vector(0, 0);
        return vector(
            leftSize.x + this.spacing + rightSize.x,
            Math.max(leftSize.y, rightSize.y));
    }
    arrange(x: number, y: number, size: Vector) {
        if (this.left) {
            const leftY = y + (size.y - this.left.size.y) / 2;
            arrange(this.left, x, leftY);
            x += this.left.size.x;
        }
        x += this.spacing;
        if (this.right) {
            const rightY = y + (size.y - this.right.size.y) / 2;
            arrange(this.right, x, rightY);
        }
    }
}

/**
 * Table with two columns and entry grouping.
 * Backbone properties:
 *     content: {
 *         name: string
 *         val: {left: string; right: string;}[]
 *     }[]
 *     captionClass: string
 *     pairClass: string
 *     percent_leftright: number
 *     indentBetweenLeftAndRight: number
 *     horIndent: number
 *     spacing: svgui.Vector
 */
export class PropertyTable extends UIElement {
    private rendered: any;
    private maxLeftWidth: number;
    private maxRightWidth: number;
    private leftWidth: number;
    private rightWidth: number;
    defaults() {
        return _.extend(super.defaults(), {
            content: [],
            captionClass: 'svguiPropertyTableGroupCaption',
            pairClass: 'svguiLabelText',
            percent_leftright: 50,
            indentBetweenLeftAndRight: 10,
            horIndent: 10,
            spacing: vector(10, 3),
        });
    }
    initialize() {
        super.initialize.apply(this, arguments);
        this.root.attr('class', 'svguiPropertyTable');
        this.update();
    }
    update() {
        removeAllChilds(<Element>this.root.node());
        this.rendered = [];
        let content = this.get('content');
        for (let i = 0; i < content.length; i++) {
            let group = content[i];
            let caption =
                new Label({parent: this.root, text: group.name, raze: false, textClass: this.get('captionClass')});
            caption.update();
            let pairs = [];
            for (let j = 0; j < group.val.length; j++) {
                let pair = group.val[j];
                let left = new Label({parent: this.root, text: pair.left, textClass: this.get('pairClass')});
                let right = new Label({parent: this.root, text: pair.right, textClass: this.get('pairClass')});
                pairs.push({left: left, right: right});
            }
            this.rendered.push({caption: caption, val: pairs});
        }
        return this;
    }
    measure(maxSize: Vector) {
        maxSize.x = Math.max(maxSize.x - this.get('horIndent') - this.get('spacing').x, 0);
        let height = 0;
        let maxGroupWidth = 0;
        this.maxLeftWidth = 0;
        this.maxRightWidth = 0;
        this.leftWidth = maxSize.x * this.get('percent_leftright') / 100;
        this.rightWidth = maxSize.x * (1 - this.get('percent_leftright') / 100);
        for (let i = 0; i < this.rendered.length; i++) {
            let group = this.rendered[i];
            let captionSize = measure(group.caption, maxSize);
            maxGroupWidth = Math.max(maxGroupWidth, captionSize.x);
            maxSize.y = Math.max(maxSize.y - captionSize.y - this.get('spacing').y, 0);
            height += captionSize.y + this.get('spacing').y;
            for (let j = 0; j < group.val.length; j++) {
                let pair = group.val[j];
                let leftSize = measure(pair.left, vector(this.leftWidth, maxSize.y));
                let rightSize = measure(pair.right, vector(this.rightWidth, maxSize.y));
                let maxHeight = Math.max(pair.left.size.y, pair.right.size.y);
//                    pair.left.size.y = pair.right.size.y = maxHeight;
                this.maxLeftWidth = Math.max(this.maxLeftWidth, leftSize.x);
                this.maxRightWidth = Math.max(this.maxRightWidth, rightSize.x);
                maxSize.y = Math.max(maxSize.y - maxHeight - this.get('spacing').y, 0);
                height += maxHeight + this.get('spacing').y;
            }
        }
        let totalLeftRightWidth =
            this.maxLeftWidth + this.maxRightWidth + this.get('horIndent') + this.get('spacing').x;
        return vector(Math.max(totalLeftRightWidth, maxGroupWidth), height);
    }
    arrange(x: number, y: number, size: Vector) {
        let rightOffsetX = this.get('horIndent') + this.maxLeftWidth + this.get('spacing').x;
        for (let i = 0; i < this.rendered.length; i++) {
            let group = this.rendered[i];
            arrange(group.caption, x, y);
            y += group.caption.size.y + this.get('spacing').y;
            for (let j = 0; j < group.val.length; j++) {
                let pair = group.val[j];
                arrange(pair.left, x + this.get('horIndent'), y, vector(this.maxLeftWidth, pair.left.size.y));
                arrange(pair.right, x + rightOffsetX, y, vector(this.maxRightWidth, pair.right.size.y));
                y += Math.max(pair.left.size.y, pair.right.size.y) + this.get('spacing').y;
            }
        }
    }
}

/**
 * Table with one columns and entry grouping.
 * Backbone properties:
 *     content: {
 *         name: string
 *         val: string[]
 *     }[]
 *     captionClass: string
 *     elementsClass: UIElement
 *     indentBetweenLeftAndRight: number
 *     horIndent: number
 *     spacing: svgui.Vector
 */
export class UIList extends UIElement {
    private rendered: any;
    private maxWidth: number;
    private width: number;
    defaults() {
        return _.extend(super.defaults(), {
            content: [],
            captionClass: 'svguiPropertyTableGroupCaption',
            horIndent: 10,
            spacing: vector(10, 3),
        });
    }
    initialize() {
        super.initialize.apply(this, arguments);
        this.root.attr('class', 'svgUIList');
        this.update();
    }
     update() {
        removeAllChilds(<Element>this.root.node());
        this.rendered = [];
        let content = this.get('content');
        for (let i = 0; i < content.length; i++) {
            let group = content[i];
            let caption = new Label({
                parent: this.root,
                text: group.name,
                raze: false,
                textClass: this.get('captionClass'),
            });
            caption.update();
            let elements = [];
            for (let j = 0; j < group.val.length; j++) {
                let element: UIElement = group.val[j];
                setAsChild(<Element>this.root.node(), <Element>element.root.node(), true);
                elements.push(element);
            }
            this.rendered.push({caption: caption, val: elements});
        }
        return this;
    }
    measure(maxSize: Vector) {
        maxSize.x = Math.max(maxSize.x - this.get('horIndent') - this.get('spacing').x, 0);
        let height = 0;
        let maxGroupWidth = 0;
        this.maxWidth = 0;
        this.width = maxSize.x;
        for (let i = 0; i < this.rendered.length; i++) {
            let group = this.rendered[i];
            let captionSize = measure(group.caption, maxSize);
            maxGroupWidth = Math.max(maxGroupWidth, captionSize.x);
            maxSize.y = Math.max(maxSize.y - captionSize.y - this.get('spacing').y, 0);
            height += captionSize.y + this.get('spacing').y;
            for (let j = 0; j < group.val.length; j++) {
                let element = group.val[j];
                let size = measure(element, vector(this.width, maxSize.y));
                let maxHeight = element.size.y;
                this.maxWidth = Math.max(this.maxWidth, size.x);
                maxSize.y = Math.max(maxSize.y - maxHeight - this.get('spacing').y, 0);
                height += maxHeight + this.get('spacing').y;
            }
        }
        let totalWidth = this.maxWidth + this.get('horIndent') + this.get('spacing').x;
        return vector(Math.max(totalWidth, maxGroupWidth), height);
    }
    arrange(x: number, y: number, size: Vector) {
        for (let i = 0; i < this.rendered.length; i++) {
            let group = this.rendered[i];
            arrange(group.caption, x, y);
            y += group.caption.size.y + this.get('spacing').y;
            for (let j = 0; j < group.val.length; j++) {
                let element = group.val[j];
                arrange(element, x + this.get('horIndent'), y, vector(this.maxWidth, element.size.y));
                y += element.size.y + this.get('spacing').y;
            }
        }
    }
}

/**
 * Expander element.
 * Backbone properties:
 *     first: UIElement
 *     expandedfirst: UIElement
 *     second: UIElement
 *     splitterMargin: number
 *     expanded: boolean
 */
export class Expander extends UIElement {
    public splitter: d3.Selection<any>;
    defaults() {
        return _.extend(super.defaults(), {
            first: null,
            second: null,
            expandedfirst: null,
            splitterMargin: 6,
            expanded: false,
        });
    }
    initialize() {
        super.initialize.apply(this, arguments);
        this.root.attr('class', 'svguiExpander');
        this.splitter = this.root.append('line').attr('class', 'svguiExpanderSplitter');
        this.update();
    }
    update() {
        let isExpanded: boolean = this.get('expanded');
        setAsChild(<Element>this.root.node(), <Element>this.splitter.node(), isExpanded);
        let second: PropertyTable = this.get('second');
        if (second) {
            second.root
                .attr('pointer-events', isExpanded ? null : 'none')
                .style('visibility', isExpanded ? 'visible' : 'collapse');
            setAsChild(<Element>this.root.node(), <Element>second.root.node(), isExpanded);
        }
        let first: UIElement = this.get('first');
        let expandedfirst: UIList = this.get('expandedfirst');

        if (expandedfirst) {
            expandedfirst.root
                .attr('pointer-events', isExpanded ? null : 'none')
                .style('visibility', isExpanded ? 'visible' : 'collapse');
            setAsChild(<Element>this.root.node(), <Element>expandedfirst.root.node(), isExpanded);
        }
        if (first) {
            first.root
                .attr('pointer-events', !isExpanded ? null : 'none')
                .style('visibility', !isExpanded ? 'visible' : 'collapse');
            setAsChild(<Element>this.root.node(), <Element>first.root.node(), !isExpanded);
        }

        return this;
    }
    measure(maxSize: Vector) {
        const isExpanded: boolean = this.get('expanded');
        const stringFirst = isExpanded ? 'expandedfirst' : 'first';
        const firstSize = measure(this.get(stringFirst), maxSize);
        if (this.get('expanded')) {
            maxSize.y = Math.max(maxSize.y - firstSize.y, 0);
            const secondSize = measure(this.get('second'), maxSize);
            return vector(Math.max(firstSize.x, secondSize.x),
                    firstSize.y + secondSize.y + this.get('splitterMargin'));
        } else {
            return firstSize;
        }
    }
    arrange(x: number, y: number, size: Vector) {
        const isExpanded: boolean = this.get('expanded');
        const stringFirst = isExpanded ? 'expandedfirst' : 'first';
        arrange(this.get(stringFirst), x, y);
        if (this.get('expanded')) {
            const lineY = y + sizeWithMargin(this.get(stringFirst)).y + this.get('splitterMargin') / 2;
            this.splitter.attr('x1', x).attr('x2', x + size.x)
                .attr('y1', lineY).attr('y2', lineY);
            y += sizeWithMargin(this.get(stringFirst)).y + this.get('splitterMargin');
            arrange(this.get('second'), x, y);
        }
    }
}

/**
 * Paginator element.
 * Backbone properties:
 *     currentPage: number
 *     pageCount: number
 *     color: any
 *     disabledColor: any
 *     isEditing: false (read-only)
 */
export class Paginator extends UIElement {
    private buttonSize: number;
    private cornerRadius: number;
    private rect: d3.Selection<any>;
    private buttons: d3.Selection<any>;
    private prevEar: PaginatorEar;
    private nextEar: PaginatorEar;
    private firstEar: PaginatorEar;
    private lastEar: PaginatorEar;
    public label: Label;
    defaults() {
        return _.extend(super.defaults(), {
            currentPage: 1,
            pageCount: 0,
            color: 'green',
            disabledColor: '#B0B0B0',
            isEditing: false,
        });
    }
    initialize() {
        super.initialize.apply(this, arguments);
        this.root.attr('class', 'svguiPaginator');
        this.buttonSize = 20;
        this.cornerRadius = 10;
        let textBox = this.root.append('g').attr('class', 'paginatorBox');
        this.rect = textBox.append('rect').attr('rx', this.cornerRadius).attr('ry', this.cornerRadius);
        this.label = new Label({
            parent: textBox,
            raze: false,
            textClass: 'paginatorText',
            margin: {left: 5, right: 5, top: 3, bottom: 3},
        });
        textBox.on('mouseover', () => {
            this.rect.attr('stroke', <any>d3.rgb(this.get('color')).brighter());
        });
        textBox.on('mouseout', () => {
            this.rect.attr('stroke', this.get('color'));
        });
        textBox.on('mousedown', () => {
            if (this.get('isEditing')) { return; }
            (<any>d3.event).preventDefault();
            makeEditableField(textBox, this.get('currentPage'), (form, field) => {
                let bounds = (<SVGRectElement> this.rect.node()).getBBox();
                form.attr('x', bounds.x).attr('y', bounds.y)
                    .attr('width', this.rect.attr('width')).attr('height', this.rect.attr('height'));
                field.attr('style',
                    'width: ' + this.rect.attr('width') + 'px; ' +
                    'height: ' + this.rect.attr('height') + 'px;');
                this.label.root.style('display', 'none');
                this.set('isEditing', true);
            }, (text) => {
                this.set('isEditing', false);
                this.label.root.style('display', null);
                if (text.match(/^[0-9]+$/)) {
                    this.changePageTo(parseInt(text, 10));
                }
            });
        });
        this.buttons = this.root.append('g');
        this.firstEar = this.createEar(true, true);
        this.lastEar  = this.createEar(false, true);
        this.nextEar  = this.createEar(false, false);
        this.prevEar  = this.createEar(true, false);
        this.update();
    }
    update() {
        this.label.set('text', this.get('currentPage').toString() + ' / ' + this.get('pageCount'));
        this.label.update();
        this.rect.attr('stroke', this.get('color'));
        if (this.get('currentPage') === 1) {
            setEarColor(this.firstEar, this.get('disabledColor'), false);
            setEarColor(this.prevEar, this.get('disabledColor'), false);
        } else {
            setEarColor(this.firstEar, this.get('color'), true);
            setEarColor(this.prevEar, this.get('color'), true);
        }
        if (this.get('currentPage') === this.get('pageCount')) {
            setEarColor(this.nextEar, this.get('disabledColor'), false);
            setEarColor(this.lastEar, this.get('disabledColor'), false);
        } else {
            setEarColor(this.nextEar, this.get('color'), true);
            setEarColor(this.lastEar, this.get('color'), true);
        }
        return this;
    }
    measure(maxSize: Vector) {
        let labelSize = measure(this.label, vector(Infinity, maxSize.y));
        return vector(labelSize.x + this.buttonSize * 4, labelSize.y);
    }
    arrange(x: number, y: number, size: Vector) {
        let rectWidth = size.x - this.buttonSize * 4;
        this.rect.attr('width', rectWidth)
            .attr('height', size.y)
            .attr('x', x + this.buttonSize * 2)
            .attr('y', y);
        arrange(this.label, x + this.buttonSize * 2 + Math.max(rectWidth - sizeWithMargin(this.label).x, 0) / 2, y);
        this.firstEar.rect.attr('x', x).attr('width', size.x / 2);
        this.prevEar.rect.attr('x', x + this.buttonSize).attr('width', size.x / 2 - this.buttonSize);
        this.nextEar.rect.attr('x', x + size.x / 2).attr('width', size.x / 2 - this.buttonSize);
        this.lastEar.rect.attr('x', x + size.x / 2).attr('width', size.x / 2);
        let ears = [this.prevEar, this.nextEar, this.firstEar, this.lastEar];
        for (let i = 0; i < ears.length; i++) {
            ears[i].rect.attr('y', y).attr('height', size.y);
        }
        let centerY = y + size.y / 2;
        this.firstEar.path.attr('transform', `translate(${x + this.buttonSize * 0.5},${centerY})`);
        this.prevEar.path.attr('transform',  `translate(${x + this.buttonSize * 1.5},${centerY})`);
        this.nextEar.path.attr('transform',  `translate(${x + rectWidth + this.buttonSize * 2.5},${centerY})`);
        this.lastEar.path.attr('transform',  `translate(${x + rectWidth + this.buttonSize * 3.5},${centerY})`);
    }
    changePageTo(newPage: number) {
        newPage = Math.min(Math.max(newPage, 1), this.get('pageCount'));
        this.set('currentPage', newPage);
    }
    private createEar(isLeft, isEnd): PaginatorEar {
        let ear = this.buttons.append('g').attr('class', 'paginatorButton');
        let rect = ear.append('rect').attr('rx', this.cornerRadius).attr('ry', this.cornerRadius);
        let path = isLeft ? 'M5,5L-5,0L5,-5' : 'M-5,5L5,0L-5,-5';
        if (isEnd) { path += isLeft ? 'M-5,5l-2,0l0,-10l2,0' : 'M5,5l2,0l0,-10l-2,0'; }
        let triangle = ear.append('path').attr('d', path);
        let earInfo = {group: ear, rect: rect, path: triangle, enabled: true};
        ear.on('mouseover', () => {
            if (earInfo.enabled) { setEarColor(earInfo, d3.rgb(this.get('color')).brighter()); }
        });
        ear.on('mouseout', () => {
            if (earInfo.enabled) { setEarColor(earInfo, this.get('color')); }
        });
        ear.on('mousedown', () => {
            if (this.get('isEditing')) { return; }
            this.changePageTo(isEnd
                ? (isLeft ? 1 : this.get('pageCount'))
                : this.get('currentPage') + (isLeft ? -1 : +1));
            if (earInfo.enabled) { setEarColor(earInfo, d3.rgb(this.get('color')).brighter()); }
            (<any>d3.event).preventDefault();
        });
        return earInfo;
    }
}

interface PaginatorEar {
    enabled?: boolean;
    rect?: d3.Selection<any>;
    path?: d3.Selection<any>;
}

function setEarColor(ear: PaginatorEar, color: any, isButtonEnabled?: boolean) {
    if (typeof isButtonEnabled !== 'undefined') {
        ear.enabled = isButtonEnabled;
    }
    ear.rect.attr('stroke', color);
    ear.path.attr('fill', color);
}

/**
 * Box with attached caption.
 * Backbone properties:
 *     color: any
 *     captionText: string
 *     borderThickness: number
 *     child: UIElement
 */
export class NamedBox extends UIElement {
    private cornerRadius: number;
    private outerRect: d3.Selection<any>;
    private captionRect: d3.Selection<any>;
    private childRect: d3.Selection<any>;
    public label: Label;
    defaults() {
        return _.extend(super.defaults(), {
            color: 'green',
            captionText: '',
            borderThickness: 1,
            child: null,
        });
    }
    initialize() {
        super.initialize.apply(this, arguments);
        this.root.attr('class', 'svguiNamedBox');
        this.cornerRadius = 10;
        this.outerRect = this.root.append('rect')
            .attr('class', 'svguiBorder')
            .attr('rx', this.cornerRadius)
            .attr('ry', this.cornerRadius)
            .attr('fill', 'white');
        this.captionRect = this.root.append('rect')
            .attr('class', 'svguiCaption')
            .attr('rx', this.cornerRadius)
            .attr('ry', this.cornerRadius);
        this.childRect = this.root.append('rect')
            .attr('fill', 'white');
        this.label = new Label({parent: this.root, raze: true, textClass: 'svguiNamedBoxCaption'});
        this.update();
    }
    update() {
        this.label.set('text', this.get('captionText'));
        this.label.update();
        this.outerRect.attr('stroke', this.get('color'));
        this.captionRect.attr('fill', this.get('color'));
        return this;
    }
    measure(maxSize: Vector) {
        let maxWidth = Math.max(maxSize.x - this.cornerRadius * 2, 0);
        let labelSize = measure(this.label, vector(maxWidth, maxSize.y));
        labelSize.y = Math.max(labelSize.y, this.cornerRadius);
        let maxChildHeight = maxSize.y - labelSize.y;
        let childSize = this.get('child') ? measure(this.get('child'), vector(maxWidth, maxChildHeight)) : vector(0);
        childSize.y = Math.max(childSize.y, this.cornerRadius);
        if (labelSize.x > childSize.x) {
            labelSize = measure(this.label, vector(childSize.x, labelSize.y));
        }
        return vector(
                childSize.x + this.cornerRadius * 2,
                labelSize.y + childSize.y);
    }
    arrange(x: number, y: number, size: Vector) {
        let captionHeight = Math.max(sizeWithMargin(this.label).y, this.cornerRadius);
        let child: UIElement = this.get('child');
        let childHeight = child ? sizeWithMargin(child).y : 0;
        childHeight = Math.max(childHeight, this.cornerRadius);
        let childWidth = size.x - this.get('borderThickness');
        this.outerRect
            .attr('width', size.x).attr('height', size.y)
            .attr('x', x).attr('y', y);
        this.captionRect
            .attr('width', size.x).attr('height', captionHeight + this.cornerRadius)
            .attr('x', x).attr('y', y);
        this.childRect
            .attr('width', childWidth).attr('height', childHeight - this.cornerRadius)
            .attr('x', x + this.get('borderThickness') / 2).attr('y', y + captionHeight);
        arrange(this.label, x + this.cornerRadius, 0);
        if (child) {
            arrange(child, x + this.cornerRadius, y + captionHeight);
        }
    }
}

function makeEditableField(
    parent: d3.Selection<any>, initialText: string,
    onCreate: (form: d3.Selection<any>, field: d3.Selection<any>) => void,
    onSubmit: (text: string) => void
): void {
    let form = parent.append('foreignObject').attr('pointer-events', 'none');
    let field = form.append('xhtml:form').append('input')
        .attr('value', function() {
            let self: HTMLInputElement = this;
            onCreate(form, d3.select(self));
            return initialText;
        })
        .call(function () {
            this.node().focus();
            let endOfText = this.node().value.length;
            this.node().setSelectionRange(0, endOfText);
        })
        // make the form go away when you jump out (form looses focus) or hit ENTER:
        .on('blur', function() {
            let text = (<Element>field.node()).nodeValue;
            onSubmit(text);
            if (form) {
                form.remove();
                form = null;
            }
        })
        .on('keypress', function () {
            if ((<any>d3.event).keyCode === 13) {
                d3.event.stopPropagation();
                d3.event.preventDefault();
                let text = (<any>field.node()).nodeValue;
                onSubmit(text);
                if (form) {
                    // .remove() fires 'blur' handler, so we need to make
                    // sure that it won't try to remove node again
                    let formToRemove = form;
                    form = null;
                    formToRemove.remove();
                }
            }
        })
        .on('input', function () {
            // HACK: force webkit to redraw input field; see the following url for details:
            // http://stackoverflow.com/questions/8185845/svg-foreignobject-behaves-as-though-absolutely-positioned-in-webkit-browsers
            form.attr('transform', 'translate(1,1)');
            form.attr('transform', null);
        });
}

export interface TextInfoResult {
    width: number;
    height: number;
    baseLineHeight: number;
    offsetY: number;
}

let textInfoCache: {
    [textElementClass: string]: {baseline: number}
} = {};

export function textInfo(stringOfText: string, textElementClass: string): TextInfoResult {
    let boundsSpan = document.getElementById('svgui-textInfo-bounds');
    if (!boundsSpan) {
        boundsSpan = $('<span id="svgui-textInfo-bounds"/>').css({
            position: 'absolute',
            left: '0',
            top: '0',
            visibility: 'hidden',
            width: 'auto',
            height: 'auto',
            'white-space': 'nowrap',
        }).get(0);
        document.body.appendChild(boundsSpan);
    }
    let baselineSpan = document.getElementById('svgui-textInfo-baseline');
    if (!baselineSpan) {
        baselineSpan = $('<span id="svgui-textInfo-baseline"/>').css({
            position: 'absolute',
            left: '0',
            top: '0',
            visibility: 'hidden',
            'vertical-align': 'baseline',
        }).get(0);
        document.body.appendChild(baselineSpan);
    }
    let span1 = document.getElementById('svgui-textInfo-span1');
    if (!span1) {
        span1 = $('<span id="svgui-textInfo-span1"/>').css({'font-size': '0'}).get(0);
        baselineSpan.appendChild(span1);
    }
    let span2 = document.getElementById('svgui-textInfo-span2');
    if (!span2) {
        span2 = $('<span id="svgui-textInfo-span2"/>').css({'font-size': '999px'}).get(0);
        baselineSpan.appendChild(span2);
    }

    let baseline;
    if (textInfoCache[textElementClass]) {
        baseline = textInfoCache[textElementClass].baseline;
    } else {
        baselineSpan.className = textElementClass;
        span1.textContent = span2.textContent = 'A';
        baseline = 1 - span1.offsetTop / baselineSpan.clientHeight; // span2.offsetHeight
        span1.textContent = span2.textContent = '';
        textInfoCache[textElementClass] = {baseline: baseline};
    }

    boundsSpan.className = textElementClass;
    boundsSpan.textContent = stringOfText;

    let result: any = {
        width: boundsSpan.clientWidth + 1,
        height: boundsSpan.clientHeight + 1,
        baseLineHeight: Math.round(baseline * (boundsSpan.clientHeight + 1)),
    };
    result.offsetY = result.height - result.baseLineHeight;
    return result;
}

export function razeText(
    element: d3.Selection<any>,
    text: string,
    textClass: string,
    textMetrics: TextInfoResult,
    maxWidth: any,
    tooltip?: string
): d3.Selection<any> {
    if (typeof textMetrics === 'undefined') { textMetrics = textInfo(text, textClass); }
    if (textMetrics.width > maxWidth) {
        let razed = text;
        let metrics = textMetrics;
        // binary search to find place to put '...'
        let l = 0, r = text.length;
        while (r - l > 1) {
            let j = Math.floor((l + r) / 2);
            razed = text.substring(0, j) + '...';
            metrics = textInfo(razed, textClass);
            if (metrics.width > maxWidth) {
                r = j;
            } else {
                l = j;
            }
        }
        element.text(razed);

        const tooltipText = typeof tooltip === 'string' ? tooltip : text;
        element.append('title').text(tooltipText);
    } else {
        element.text(text);
    }
    return element;
}

function splitIntoLines(width: number | ((lineIndex: number) => number), text: string, textClass: string): string[] {
    function maxWidth(lineIndex: number): number {
        return typeof width === 'function' ? (<(number) => number>width)(lineIndex) : <number>width;
    }
    let resultLines: string[] = [];
    let i = 0;
    let line = '';
    while (i < text.length) {
        let j = text.indexOf(' ', i);
        if (j < 0) {
            j = text.length;
        }
        let longerLine = line + (line.length > 0 ? ' ' : '') + text.substring(i, j);
        let ti = textInfo(longerLine, textClass);
        if (ti.width <= maxWidth(resultLines.length)) {
            line = longerLine;
            i = j + 1;
        } else {
            if (line.length > 0) {
                resultLines.push(line);
                line = '';
            } else {
                // binary search to find wrap index
                let l = i,
                    r = text.length;
                while (r - l > 1) {
                    j = Math.floor((l + r) / 2);
                    longerLine = line + text.substring(i, j);
                    ti = textInfo(longerLine, textClass);
                    if (ti.width > maxWidth(resultLines.length)) {
                        r = j;
                    } else {
                        l = j;
                    }
                }
                if (longerLine.length > 0) {
                    resultLines.push(longerLine);
                    line = '';
                    i = j;
                }
            }
        }
    }
    if (line.length > 0) {
        resultLines.push(line);
    }
    return resultLines;
}

/**
 * text is a URL, if any below condition is met:
 *  - starts with http:// etc
 *  - looks like www.<name1>.<...>.<nameN>
 *  - starts with / или ./ или ../
 */
function matchUrl(text: string) {
    function nullIfUndefined<T>(value: T = null): T {
        return value;
    }
    let match = text.match(/^(http|ftp|https):\/\/([\w\-_]+(?:\.[\w\-_]+)+)([\w\-\.,@?^=%&amp;:/~\+#]*[\w\-@?^=%&amp;/~\+#])?\s*$/);
    if (match) {
        return {protocol: match[1], host: match[2], path: nullIfUndefined(match[3])};
    }
    match = text.match(/^([a-zA-Z]+[a-zA-Z-]*(?:\.[a-zA-Z]+[a-zA-Z-]*)+)(\/[\w\-\.,@?^=%&amp;:/~\+#]*[\w\-@?^=%&amp;/~\+#])?\s*$/);
    if (match) {
        return {protocol: null, host: match[1], path: nullIfUndefined(match[2])};
    }
    match = text.match(/^(\.{0,2}\/[\w\-\.,@?^=%&amp;:/~\+#]*[\w\-@?^=%&amp;/~\+#])\s*$/);
    if (match) {
        return {protocol: null, host: null, path: nullIfUndefined(match[1])};
    }
    return null;
}

interface WrappedHyperlink {
    parent: d3.Selection<any>;
    text: string;
    icon?: d3.Selection<any>;
    url?: string;
}
/**
 * Creates a parent for a hyperlink content and (for some URLs) appends an icon.
 * Doesn't do anything if textOrUrl isn't a URL.
 * @returns {
 *     parent: <new parent selector for link content>,
 *     text: <text or url to display>,
 *     icon: <icon selector if present; otherwise null>
 *     url: <url if present; otherwise null>
 * }
 */
function wrapHyperlink(hyperlinkParent: d3.Selection<any>, textOrUrl: string): WrappedHyperlink {
    function emptyIfNull(text: string): string {
        return text == null ? '' : text;
    }
    function getFileName(path: string, extension: string): string {
        let match = new RegExp('([\\w\\.\\+\\-]+)\\.' + extension + '$', 'i').exec(path);
        return match ? match[1] : null;
    }
    let match = matchUrl(textOrUrl);
    if (!match) {
        return {parent: hyperlinkParent, text: textOrUrl};
    }
    let url = textOrUrl;
    let text = textOrUrl;
    if (match.protocol != null) {
        text = emptyIfNull(match.host) + emptyIfNull(match.path);
    } else if (match.host != null) {
        url = 'http://' + textOrUrl;
    }
    let path = match.path;
    let imageUrl: string = null;
    let fileName: string;
    if (fileName = getFileName(path, 'pdf')) {
        imageUrl = '../images/icons/pdf.svg';
    } else if (fileName = getFileName(path, '(?:doc|docx|docm)')) {
        imageUrl = '../images/icons/doc.svg';
    } else if (fileName = getFileName(path, '(?:xls|xlsx|xlsm)')) {
        imageUrl = '../images/icons/xls.svg';
    } else if (fileName = getFileName(path, '(?:ppt|pptx|pptm)')) {
        imageUrl = '../images/icons/ppt.svg';
    } else if (/youtube\.com$/i.test(match.host)) {
        imageUrl = '../images/icons/youtube.svg';
    }
    let parent = hyperlinkParent.append('svg:a')
        .attr('xlink:href', url)
        .attr('target', '_blank')
        .attr('class', 'svguiHyperlink')
        .on('mousedown', function () {
            (<any>d3.event).stopPropagation();
        });
    let icon: d3.Selection<any> = null;
    if (imageUrl != null) {
        icon = parent.append('svg:image')
            .attr('xlink:href', imageUrl);
    }
    return {parent: parent, text: fileName != null ? fileName : text, icon: icon, url: url};
}

export function removeDocumentSelection() {
    let _window: any = window;
    let _document: any = document;
    if (_window.getSelection) {
        let selection: any = _window.getSelection();
        if (selection.empty) {  // Chrome
            selection.empty();
        } else if (selection.removeAllRanges) {  // Firefox
            selection.removeAllRanges();
        }
    } else if (_document.selection) {  // IE?
        _document.selection.empty();
    }
}
