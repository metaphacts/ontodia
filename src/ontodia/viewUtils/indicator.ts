import * as d3 from 'd3';

/**
 * Returns a remainder of an ease function starting from elapsedTime.
 */
function resumedEase(elapsedTime: number, ease?: any) {
    if (typeof ease === 'undefined') { ease = 'cubic-in-out'; }
    const y = typeof ease === 'function' ? ease : d3.ease.call(d3, ease);
    const scaleOriginal = d3.scale.linear().domain([0, 1]).range([elapsedTime, 1]);
    const scaleResult   = d3.scale.linear().domain([y(elapsedTime), 1]).range([0, 1]);
    return function (xResumed: number) {
        const xOriginal = scaleOriginal(xResumed);
        return scaleResult(y(xOriginal));
    };
}

class ReferenceClock {
    /**
     * @param element Element to run reference transition, must not be running any other transition.
     */
    constructor(readonly element: HTMLElement) { /* nothing */ }

    run(duration: number, startTime: number) {
        const element = d3.select(this.element);
        element.attr('data-reference-time', startTime);
        element.transition()
            .ease('linear')
            .duration(duration * (1 - startTime))
            .attr('data-reference-time', 1);
        return this;
    }

    /** @returns current time scaled from 0 to 1 */
    time(): number {
        return Number(d3.select(this.element).attr('data-reference-time'));
    }
}

export interface IndicatorParams {
    size?: number;
    position?: {x: number; y: number};
    maxWidth?: number;
}

export class Indicator {
    static instances: Indicator[];

    statusText: string = null;
    isErrorOccurred = false;
    spacing = 5;
    isVisible = true;

    position: { x: number; y: number; };
    size: number;
    maxWidth: number;

    private animation: any;
    private arrowPath: any;
    private text: any;
    private clock: any;

    constructor(
        readonly parent: SVGElement,
        params: IndicatorParams
    ) {
        if (params.position) {
            this.position = params.position;
        } else {
            const selection = d3.select(parent);
            this.position = {
                x: Number(selection.attr('width')) / 2,
                y: Number(selection.attr('height')) / 2,
            };
        }
        this.size = params.size === undefined ? 50 : params.size;
        this.maxWidth = params.maxWidth === undefined ? Infinity : params.maxWidth;
    }
    run() {
        this.animate(this.parent);
        return this;
    }
    status(statusText: string) {
        this.statusText = statusText;
        this.updateState();
    }
    error() {
        this.isErrorOccurred = true;
        this.updateState();
    }
    visible(isVisible: boolean) {
        this.isVisible = isVisible;
        if (this.animation) {
            this.animation.attr('display', isVisible ? null : 'none');
        }
    }
    moveTo(position: { x: number; y: number; }) {
        this.position = position;
        if (this.animation) {
            this.animation.attr('transform', 'translate(' + this.position.x + ',' + this.position.y + ')');
        }
    }
    /**
     * Adds waiting animation.
     */
    private animate(svg: SVGElement) {
        this.animation = d3.select(svg).append('svg:g')
            .attr('transform', 'translate(' + this.position.x + ',' + this.position.y + ')')
            .attr('display', this.isVisible ? null : 'none');
        const arrow = this.animation.append('svg:g');
        this.arrowPath = arrow.append('svg:path')
            .attr('d', 'm3.47,-19.7 a20,20 0 1,1 -6.95,0 m0,0 l-6,5 m6,-5 l-8,-0')
            .attr('transform', 'scale(0.02)' + 'scale(' + this.size + ')')
            .attr('fill', 'none')
            .attr('stroke', 'black')
            .attr('stroke-width', 3)
            .attr('stroke-linecap', 'round');
        this.text = this.animation.append('text')
            .attr('class', 'indicatorText')
            .style('dominant-baseline', 'middle')
            .attr('x', this.size / 2 + this.spacing);
        // add repeating rotate animation
        const duration = 1500;
        const time =  Indicator.instances.length > 0 ? Indicator.instances[0].clock.time() : 0;
        const clock = this.clock = new ReferenceClock(this.animation.node()).run(duration, time);
        const startAngle = d3.ease('cubic-in-out')(time) * 360;
        if (!this.isErrorOccurred) {
            arrow.transition()
                .duration(duration * (1 - time))
                .ease(resumedEase(time))
                .attrTween('transform', function () {
                    return d3.interpolateString('rotate(' + startAngle + ')', 'rotate(360)');
                }).each('end', rotateArrow);
        }
        const self = this;
        function rotateArrow() {
            if (self.isErrorOccurred) { return; }
            clock.run(duration, 0);
            arrow.transition()
                .duration(duration)
                .attrTween('transform', function () {
                    return d3.interpolateString('rotate(0)', 'rotate(360)');
                }).each('end', rotateArrow);
        }
        Indicator.instances.push(this);
        this.updateState();
    }
    remove() {
        if (!this.animation) { return; }
        const index = Indicator.instances.indexOf(this);
        if (index >= 0) { Indicator.instances.splice(index, 1); }
        this.parent.removeChild(this.animation.node());
        this.animation = null;
    }
    private updateState() {
        if (this.text) {
            this.text.text(this.statusText);
        }
        if (this.animation && this.isErrorOccurred) {
            const index = Indicator.instances.indexOf(this);
            if (index >= 0) { Indicator.instances.splice(index, 1); }
            this.arrowPath.attr('stroke', 'red');
            this.arrowPath.attr('d', this.arrowPath.attr('d') + 'M-8,-8L8,8M-8,8L8,-8');
        }
    }
}
Indicator.instances = [];

/**
 * Displays an indicator of some operation on top of SVG element.
 * Example usage:
 *     var indicator = WrapIndicator.create(d3.select('#svg'));
 *     d3.json('data.js', function(data) {
 *         indicator.remove();
 *         // display the data in #svg
 *     });
 */
export class WrapIndicator {
    private parent: SVGElement;
    private indicator: Indicator;
    private wrapper: any;
    private running: boolean;
    private pointerEvents: any;

    static wrap(parent: SVGElement, params: IndicatorParams) {
        const parentSelection = d3.select(parent);
        const wrapIndicator = new WrapIndicator();
        wrapIndicator.parent = parent;
        wrapIndicator.wrapper = parentSelection.append('svg:g');
        WrapIndicator.moveChildren(parent, wrapIndicator.wrapper.node());
        wrapIndicator.indicator = new Indicator(parent, params);
        wrapIndicator.wrapper
            .transition()
            .style('opacity', 0.2)
            .each('end', function() {
                if (wrapIndicator.running) {
                    wrapIndicator.indicator.run();
                }
            });
        wrapIndicator.pointerEvents = parentSelection.attr('pointer-events');
        parentSelection.attr('pointer-events', 'none');
        wrapIndicator.running = true;
        return wrapIndicator;
    }
    status(statusText: string) {
        this.indicator.status(statusText);
    }
    error() {
        this.indicator.error();
    }
    remove() {
        if (!this.running) { return; }
        this.running = false;
        this.indicator.remove();
        d3.select(this.parent).attr('pointer-events', this.pointerEvents);
        WrapIndicator.moveChildren(this.wrapper.node(), this.parent);
        this.parent.removeChild(this.wrapper.node());
    }
    /**
     * Move children nodes from node 'from' to node 'to' except node 'to' itself.
     */
    static moveChildren(from: Node, to: Node) {
        for (let node = from.firstChild; node != null; ) {
            const next = node.nextSibling;
            if (node !== to) {
                from.removeChild(node);
                to.appendChild(node);
            }
            node = next;
        }
    }
}
