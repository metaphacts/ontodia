import * as React from 'react';
import { Component, SVGAttributes, CSSProperties } from 'react';
import * as Backbone from 'backbone';
import * as joint from 'jointjs';

import { LocalizedString } from '../data/model';
import { Debouncer } from '../diagram/dataFetchingThread';
import { LinkStyle, LinkLabel } from '../customization/props';

import { Element as GraphElement, Link, linkMarkerKey } from './elements';
import { DiagramModel } from './model';
import { DiagramView } from './view';

export interface PaperProps {
    view: DiagramView;
    width: number;
    height: number;
    originX: number;
    originY: number;
    scale: number;
    paddingX: number;
    paddingY: number;
    onPointerDown?: (e: React.MouseEvent<HTMLElement>, cell: GraphElement | Link | undefined) => void;
}

interface State {}

const CLASS_NAME = 'ontodia-paper';

export class PaperLinks extends Component<{ view: DiagramView }, {}> {
    private readonly listener = new Backbone.Model();
    private readonly delayedUpdate = new Debouncer();

    componentDidMount() {
        const {view} = this.props;
        const graph = view.model.graph;
        this.listener.listenTo(graph, 'add remove reset', this.scheduleUpdateAll);
        this.listener.listenTo(graph, 'change:position change:size', this.scheduleUpdateAll);
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.delayedUpdate.dispose();
    }

    shouldComponentUpdate() {
        return false;
    }

    private scheduleUpdateAll = () => {
        this.delayedUpdate.call(this.updateAll);
    }

    private updateAll = () => {
        this.forceUpdate();
    }

    render() {
        const {view} = this.props;
        return <g>
            {view.model.links.map(model => (
                <LinkView key={model.id} view={view} model={model as Link} />
            ))}
        </g>;
    }
}

export class Paper extends Component<PaperProps, State> {
    private readonly listener = new Backbone.Model();

    componentDidMount() {
        const {view} = this.props;
        const graph = view.model.graph;
        this.listener.listenTo(graph, 'add remove reset', this.updateAll);
        this.listener.listenTo(graph, 'change:position change:size', this.updateAll);
    }

    componentWillUnmount() {
        this.listener.stopListening();
    }

    private updateAll = () => this.forceUpdate();

    render() {
        const {width, height, originX, originY, scale, paddingX, paddingY} = this.props;
        const scaledWidth = width * scale;
        const scaledHeight = height * scale;
        const style: CSSProperties = {
            width: scaledWidth,
            height: scaledHeight,
            marginLeft: paddingX,
            marginRight: paddingX,
            marginTop: paddingY,
            marginBottom: paddingY,
        };
        return (
            <div className={CLASS_NAME} style={style} onMouseDown={this.onMouseDown}>
                <svg width={scaledWidth} height={scaledHeight} style={{overflow: 'visible'}}>
                    <defs>
                        <filter id='solid-fill' x='0' y='0' width='1' height='1' dangerouslySetInnerHTML={{__html: `
                            <feFlood flood-color='white' />
                            <feComposite in='SourceGraphic' operator='atop' />
                        `}} />
                    </defs>
                    <g transform={`scale(${scale},${scale})translate(${originX},${originY})`}>
                        <PaperLinks view={this.props.view} />
                        {/*this.renderElements()*/}
                    </g>
                </svg>
                {this.props.children}
            </div>
        );
    }

    private renderElements() {
        const {view} = this.props;
        return view.model.elements.map(model => <ElementView key={model.id} model={model} />);
    }

    private onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        const {view, onPointerDown} = this.props;
        const cell = e.target instanceof Element
            ? findCell(e.target, e.currentTarget, view.model) : undefined;
        if (onPointerDown) {
            onPointerDown(e, cell);
        }
    }
}

function findCell(bottom: Element, top: Element, model: DiagramModel): GraphElement | Link | undefined {
    let target: Node = bottom;
    while (true) {
        if (target instanceof Element) {
            if (target.hasAttribute('data-element-id')) {
                return model.getElement(target.getAttribute('data-element-id'));
            } else if (target.hasAttribute('data-link-id')) {
                return model.getLinkById(target.getAttribute('data-link-id'));
            }
        }
        if (!target || target === top) { break; }
        target = target.parentNode;
    }
    return undefined;
}

class ElementView extends Component<{ model: joint.dia.Element }, {}> {
    componentDidMount() {
        this.props.model.on('change:size', this.onModelChangeSize);
    }

    componentWillUnmount() {
        this.props.model.off('change:size', this.onModelChangeSize);
    }

    private onModelChangeSize = () => {
        this.forceUpdate();
    }

    render() {
        const {model} = this.props;
        const {x, y} = model.get('position') || {x: 0, y: 0};
        const size = model.get('size') || {width: 0, height: 0};
        return (
            <g data-element-id={model.id}>
                <rect x={x} y={y} width={size.width} height={size.height}
                    fill='green' stroke='red' strokeWidth={3}
                />
            </g>
        );
    }
}

class LinkView extends Component<{ view: DiagramView; model: Link; }, {}> {
    render() {
        const {view, model} = this.props;
        const typeIndex = model.typeIndex;
        const source = view.model.getElement(model.sourceId);
        const target = view.model.getElement(model.targetId);
        if (!(source && target)) {
            return null;
        }

        const vertices: Array<{ x: number; y: number; }> = model.get('vertices') || [];

        const sourceRect = boundsOf(source);
        const targetRect = boundsOf(target);

        const startPoint = intersectRayFromRectangleCenter(
            sourceRect, vertices.length > 0 ? vertices[0] : centerOfRectangle(targetRect));
        const endPoint = intersectRayFromRectangleCenter(
            targetRect, vertices.length > 0 ? vertices[vertices.length - 1] : centerOfRectangle(sourceRect));
        const polyline = [startPoint, ...vertices, endPoint];

        const path = 'M' + polyline.map(({x, y}) => `${x},${y}`).join(' L');

        const template = view.getLinkTemplate(model.typeId);
        const style = template.renderLink(model.template);
        const pathAttributes = this.getPathAttributes(style);

        return (
            <g data-link-id={model.id} data-source-id={source.id} data-target-id={target.id}>
                <path className='connection' d={path} {...pathAttributes}
                    markerStart={`url(#${linkMarkerKey(typeIndex, true)})`}
                    markerEnd={`url(#${linkMarkerKey(typeIndex, false)})`} />
                <path className='connection-wrap' d={path} />
                {this.renderLabels(polyline, style)}
                <g className='marker-vertices' />
                <g className='link-tools' />
            </g>
        );
    }

    private getPathAttributes(style: LinkStyle): SVGAttributes<SVGPathElement> {
        const {model} = this.props;
        let attributes: SVGAttributes<SVGPathElement> = {
            stroke: 'black',
            strokeDasharray: model.layoutOnly ? '5,5' : null,
        };
        if (style.connection) {
            const {fill, stroke, 'stroke-width': strokeWidth, 'stroke-dasharray': strokeDasharray} = style.connection;
            attributes = {
                ...attributes,
                fill,
                stroke,
                strokeWidth,
                strokeDasharray,
            };
        }
        return attributes;
    }

    private renderLabels(polyline: ReadonlyArray<Vector>, style: LinkStyle) {
        const {view, model} = this.props;
        const polylineLength = computePolylineLength(polyline);

        interface LabelAttributes {
            offset: number;
            text: LocalizedString;
            stroke?: string;
            strokeWidth?: number;
            fill?: string;
        }

        const labels: LabelAttributes[] = [];

        const labelStyle = style.label || {};
        const labelTexts = labelStyle.attrs && labelStyle.attrs.text ? labelStyle.attrs.text.text : undefined;
        const labelText = labelTexts ? view.getLocalizedText(labelTexts) : view.getLinkLabel(model.typeId);
        labels.push({
            offset: labelStyle.position || 0.5,
            text: labelText,
        });

        if (style.properties) {
            for (const property of style.properties) {
                if (!(property.attrs && property.attrs.text && property.attrs.text.text)) {
                    continue;
                }
                const text = view.getLocalizedText(property.attrs.text.text);
                labels.push({
                    offset: property.position || 0.5,
                    text,
                });
            }
        }

        return (
            <g className='labels'>
                {labels.map((label, index) => {
                    const {x, y} = getPointAlongPolyline(polyline, polylineLength * label.offset);
                    // missing from typings
                    const otherAttributes: object = {alignmentBaseline: 'middle'};
                    return (
                        <text key={index} x={x} y={y} textAnchor='middle'
                            filter='url(#solid-fill)' style={{fontWeight: 'bold'}} {...otherAttributes}
                            stroke={label.stroke} strokeWidth={label.strokeWidth} fill={label.fill}>
                            {label.text.text}
                        </text>
                    );
                })}
            </g>
        );
    }
}

interface Vector {
    readonly x: number;
    readonly y: number;
}

interface Rect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

function boundsOf(element: GraphElement): Rect {
    const {x, y} = element.get('position') || {x: 0, y: 0};
    const {width, height} = element.get('size') || {width: 0, height: 0};
    return {x, y, width, height};
}

function centerOfRectangle({x, y, width, height}: Rect): Vector {
    return {x: x + width / 2, y: y + height / 2};
}

function length({x, y}: Vector) {
    return Math.sqrt(x * x + y * y);
}

function normalize({x, y}: Vector) {
    if (x === 0 && y === 0) { return {x, y}; }
    const inverseLength = 1 / Math.sqrt(x * x + y * y);
    return {x: x * inverseLength, y: y * inverseLength};
}

function cross2D({x: x1, y: y1}: Vector, {x: x2, y: y2}: Vector) {
    return x1 * y2 - y1 * x2;
}

function intersectRayFromRectangleCenter(sourceRect: Rect, rayTarget: Vector) {
    const isTargetInsideRect =
        sourceRect.width === 0 || sourceRect.height === 0 ||
        rayTarget.x > sourceRect.x && rayTarget.x < (sourceRect.x + sourceRect.width) &&
        rayTarget.y > sourceRect.y && rayTarget.y < (sourceRect.y + sourceRect.height);

    const halfWidth = sourceRect.width / 2;
    const halfHeight = sourceRect.height / 2;
    const center = {
        x: sourceRect.x + halfWidth,
        y: sourceRect.y + halfHeight,
    };
    if (isTargetInsideRect) {
        return center;
    }

    const direction = normalize({
        x: rayTarget.x - center.x,
        y: rayTarget.y - center.y,
    });

    const rightDirection = {x: Math.abs(direction.x), y: direction.y};
    const isHorizontal =
        cross2D({x: halfWidth, y: -halfHeight}, rightDirection) > 0 &&
        cross2D({x: halfWidth, y: halfHeight}, rightDirection) < 0;

    if (isHorizontal) {
        return {
            x: center.x + halfWidth * Math.sign(direction.x),
            y: center.y + halfWidth * direction.y / Math.abs(direction.x),
        };
    } else {
        return {
            x: center.x + halfHeight * direction.x / Math.abs(direction.y),
            y: center.y + halfHeight * Math.sign(direction.y),
        };
    }
}

function computePolylineLength(polyline: ReadonlyArray<Vector>): number {
    let previous: Vector;
    return polyline.reduce((acc, point) => {
        const segmentLength = previous ? length({x: point.x - previous.x, y: point.y - previous.y}) : 0;
        previous = point;
        return acc + segmentLength;
    }, 0);
}

function getPointAlongPolyline(polyline: ReadonlyArray<Vector>, offset: number): Vector {
    if (polyline.length === 0) {
        throw new Error('Cannot compute a point for empty polyline');
    }
    if (offset < 0) {
        return polyline[0];
    }
    let currentOffset = 0;
    for (let i = 1; i < polyline.length; i++) {
        const previous = polyline[i - 1];
        const point = polyline[i];
        const segment = {x: point.x - previous.x, y: point.y - previous.y};
        const segmentLength = length(segment);
        const newOffset = currentOffset + segmentLength;
        if (offset < newOffset) {
            const leftover = (offset - currentOffset) / segmentLength;
            return {
                x: previous.x + leftover * segment.x,
                y: previous.y + leftover * segment.y,
            };
        } else {
            currentOffset = newOffset;
        }
    }
    return polyline[polyline.length - 1];
}
