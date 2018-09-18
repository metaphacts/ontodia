import * as React from 'react';
import { Component, ReactElement, SVGAttributes, CSSProperties } from 'react';

import { LocalizedString } from '../data/model';
import {
    LinkTemplate, LinkStyle, LinkLabel as LinkLabelProperties, LinkMarkerStyle, RoutedLink,
} from '../customization/props';
import { Debouncer } from '../viewUtils/async';
import { createStringMap } from '../viewUtils/collections';
import { EventObserver } from '../viewUtils/events';

import { restoreCapturedLinkGeometry } from './commands';
import { Element as DiagramElement, Link as DiagramLink, LinkVertex, linkMarkerKey, FatLinkType } from './elements';
import {
    Vector, computePolyline, computePolylineLength, getPointAlongPolyline, computeGrouping,
} from './geometry';
import { DiagramView, RenderingLayer } from './view';

export interface LinkLayerProps {
    view: DiagramView;
    links: ReadonlyArray<DiagramLink>;
    group?: string;
}

enum UpdateRequest {
    /** Some part of layer requested an update */
    Partial = 1,
    /** Full update requested */
    All,
}

const CLASS_NAME = 'ontodia-link-layer';

export class LinkLayer extends Component<LinkLayerProps, {}> {
    private readonly listener = new EventObserver();
    private readonly delayedUpdate = new Debouncer();

    private updateState = UpdateRequest.Partial;
    /** List of link IDs to update at the next flush event */
    private scheduledToUpdate = createStringMap<true>();

    constructor(props: LinkLayerProps, context: any) {
        super(props, context);
    }

    componentDidMount() {
        const {view} = this.props;

        this.listener.listen(view.events, 'changeLanguage', this.scheduleUpdateAll);
        this.listener.listen(view.model.events, 'changeCells', this.scheduleUpdateAll);
        this.listener.listen(view.model.events, 'elementEvent', ({data}) => {
            const elementEvent = data.changePosition || data.changeSize;
            if (!elementEvent) { return; }
            for (const link of elementEvent.source.links) {
                this.scheduleUpdateLink(link.id);
            }
        });
        this.listener.listen(view.model.events, 'linkEvent', ({data}) => {
            const linkEvent = (
                data.changeData ||
                data.changeLayoutOnly ||
                data.changeVertices
            );
            if (linkEvent) {
                this.scheduleUpdateLink(linkEvent.source.id);
            }
        });
        this.listener.listen(view.model.events, 'linkTypeEvent', ({data}) => {
            const linkTypeEvent = data.changeLabel || data.changeVisibility;
            if (!linkTypeEvent) { return; }
            const linkTypeId = linkTypeEvent.source.id;
            for (const link of view.model.linksOfType(linkTypeId)) {
                this.scheduleUpdateLink(link.id);
            }
        });
        this.listener.listen(view.events, 'syncUpdate', ({layer}) => {
            if (layer !== RenderingLayer.Link) { return; }
            this.delayedUpdate.runSynchronously();
        });
    }

    shouldComponentUpdate() {
        return false;
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.delayedUpdate.dispose();
    }

    private scheduleUpdateAll = () => {
        if (this.updateState !== UpdateRequest.All) {
            this.updateState = UpdateRequest.All;
            this.scheduledToUpdate = createStringMap<true>();
        }
        this.delayedUpdate.call(this.performUpdate);
    }

    private scheduleUpdateLink(linkId: string) {
        if (this.updateState === UpdateRequest.Partial) {
            this.scheduledToUpdate[linkId] = true;
        }
        this.delayedUpdate.call(this.performUpdate);
    }

    private popShouldUpdatePredicate(): (model: DiagramLink) => boolean {
        const {updateState, scheduledToUpdate} = this;
        this.scheduledToUpdate = createStringMap<true>();
        this.updateState = UpdateRequest.Partial;
        return updateState === UpdateRequest.All
            ? () => true
            : link => Boolean(scheduledToUpdate[link.id]);
    }

    private performUpdate = () => {
        this.forceUpdate();
    }

    private getLinks = () => {
        const {view, links, group} = this.props;

        if (!group) { return links; }

        const grouping = computeGrouping(view.model.elements);
        const nestedElements = computeDeepNestedElements(grouping, group);

        return links.filter(link => {
            const {sourceId, targetId} = link;

            const source = view.model.getElement(sourceId);
            const target = view.model.getElement(targetId);

            if (!source || !target) { return false; }

            const sourceGroup = source.group;
            const targetGroup = target.group;

            return nestedElements[sourceGroup] || nestedElements[targetGroup];
        });
    }

    render() {
        const {view} = this.props;
        const shouldUpdate = this.popShouldUpdatePredicate();

        return <g className={CLASS_NAME}>
            {this.getLinks().map(model => (
                <LinkView key={model.id}
                    view={view}
                    model={model}
                    shouldUpdate={shouldUpdate(model)}
                    route={view.getRouting(model.id)}
                />
            ))}
        </g>;
    }
}

function computeDeepNestedElements(grouping: Map<string, DiagramElement[]>, groupId: string): { [id: string]: true } {
    const deepChildren: { [elementId: string]: true } = {};

    function collectNestedItems(parentId: string) {
        deepChildren[parentId] = true;
        const children = grouping.get(parentId);
        if (!children) { return; }
        for (const element of children) {
            if (element.group !== parentId) { continue; }
            collectNestedItems(element.id);
        }
    }

    collectNestedItems(groupId);
    return deepChildren;
}

interface LinkViewProps {
    view: DiagramView;
    model: DiagramLink;
    shouldUpdate: boolean;
    route?: RoutedLink;
}

const LINK_CLASS = 'ontodia-link';
const LABEL_GROUPING_PRECISION = 100;
// temporary, cleared-before-render map to hold line numbers for labels
// grouped on the same link offset
const TEMPORARY_LABEL_LINES = new Map<number, number>();

class LinkView extends Component<LinkViewProps, {}> {
    private linkType: FatLinkType;
    private template: LinkTemplate;

    constructor(props: LinkViewProps, context: any) {
        super(props, context);
        this.grabLinkTemplate(this.props);
    }

    componentWillReceiveProps(nextProps: LinkViewProps) {
        if (this.linkType.id !== nextProps.model.typeId) {
            this.grabLinkTemplate(nextProps);
        }
    }

    shouldComponentUpdate(nextProps: LinkViewProps, nextState: {}) {
        return nextProps.shouldUpdate;
    }

    private grabLinkTemplate(props: LinkViewProps) {
        this.linkType = props.view.model.getLinkType(props.model.typeId);
        this.template = props.view.createLinkTemplate(this.linkType);
    }

    render() {
        const {view, model, route} = this.props;
        const source = view.model.getElement(model.sourceId);
        const target = view.model.getElement(model.targetId);
        if (!(source && target)) {
            return null;
        }

        const verticesDefinedByUser = model.vertices || [];
        const vertices = route ? route.vertices : verticesDefinedByUser;
        const polyline = computePolyline(source, target, vertices);

        const path = 'M' + polyline.map(({x, y}) => `${x},${y}`).join(' L');

        const {index: typeIndex, showLabel} = this.linkType;
        const style = this.template.renderLink(model.data);
        const pathAttributes = getPathAttributes(model, style);

        return (
            <g className={LINK_CLASS} data-link-id={model.id} data-source-id={source.id} data-target-id={target.id}>
                <path className={`${LINK_CLASS}__connection`} d={path} {...pathAttributes}
                    markerStart={`url(#${linkMarkerKey(typeIndex, true)})`}
                    markerEnd={`url(#${linkMarkerKey(typeIndex, false)})`} />
                <path className={`${LINK_CLASS}__wrap`} d={path} />
                {showLabel ? this.renderLabels(polyline, style) : undefined}
                {this.renderVertices(verticesDefinedByUser, pathAttributes.stroke)}
            </g>
        );
    }

    private renderVertices(vertices: ReadonlyArray<Vector>, fill: string) {
        const elements: ReactElement<any>[] = [];

        const vertexClass = `${LINK_CLASS}__vertex`;
        const vertexRadius = 10;

        let index = 0;
        for (const {x, y} of vertices) {
            elements.push(
                <circle key={index * 2}
                    data-vertex={index} className={vertexClass}
                    cx={x} cy={y} r={vertexRadius} fill={fill} />
            );
            elements.push(
                <VertexTools key={index * 2 + 1}
                    className={`${LINK_CLASS}__vertex-tools`}
                    model={this.props.model} vertexIndex={index}
                    vertexRadius={vertexRadius} x={x} y={y}
                    onRemove={this.onRemoveLinkVertex}
                />
            );
            index++;
        }

        return <g className={`${LINK_CLASS}__vertices`}>{elements}</g>;
    }

    private onRemoveLinkVertex = (vertex: LinkVertex) => {
        const model = this.props.view.model;
        model.history.registerToUndo(
            restoreCapturedLinkGeometry(vertex.link)
        );
        vertex.remove();
    }

    private renderLabels(polyline: ReadonlyArray<Vector>, style: LinkStyle) {
        const {view, model, route} = this.props;

        const labels = computeLinkLabels(model, style, view);

        let textAnchor: 'start' | 'middle' | 'end' = 'middle';
        if (route && route.labelTextAnchor) {
            textAnchor = route.labelTextAnchor;
        }

        const polylineLength = computePolylineLength(polyline);
        TEMPORARY_LABEL_LINES.clear();

        return (
            <g className={`${LINK_CLASS}__labels`}>
                {labels.map((label, index) => {
                    const {x, y} = getPointAlongPolyline(polyline, polylineLength * label.offset);
                    const groupKey = Math.round(label.offset * LABEL_GROUPING_PRECISION) / LABEL_GROUPING_PRECISION;
                    const line = TEMPORARY_LABEL_LINES.get(groupKey) || 0;
                    TEMPORARY_LABEL_LINES.set(groupKey, line + 1);
                    return (
                        <LinkLabel key={index}
                            x={x} y={y}
                            line={line}
                            label={label}
                            textAnchor={textAnchor}
                        />
                    );
                })}
            </g>
        );
    }
}

function computeLinkLabels(model: DiagramLink, style: LinkStyle, view: DiagramView) {
    const labels: LabelAttributes[] = [];

    const labelStyle = style.label || {};
    const labelTexts = labelStyle.attrs && labelStyle.attrs.text ? labelStyle.attrs.text.text : undefined;
    const labelText = (labelTexts && labelTexts.length > 0)
        ? view.getLocalizedText(labelTexts)
        : view.getLinkLabel(model.typeId);
    labels.push({
        offset: labelStyle.position || 0.5,
        text: labelText,
        attributes: {
            text: getLabelTextAttributes(labelStyle),
            rect: getLabelRectAttributes(labelStyle),
        },
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
                attributes: {
                    text: getLabelTextAttributes(property),
                    rect: getLabelRectAttributes(property),
                },
            });
        }
    }

    return labels;
}

function getPathAttributes(model: DiagramLink, style: LinkStyle): SVGAttributes<SVGPathElement> {
    const connectionAttributes: LinkStyle['connection'] = style.connection || {};
    const defaultStrokeDasharray = model.layoutOnly ? '5,5' : undefined;
    const {
        fill = 'none',
        stroke = 'black',
        'stroke-width': strokeWidth,
        'stroke-dasharray': strokeDasharray = defaultStrokeDasharray,
    } = connectionAttributes;
    return {fill, stroke, strokeWidth, strokeDasharray};
}

function getLabelTextAttributes(label: LinkLabelProperties): CSSProperties {
    const {
        fill = 'black',
        stroke = 'none',
        'stroke-width': strokeWidth = 0,
        'font-family': fontFamily = '"Helvetica Neue", "Helvetica", "Arial", sans-serif',
        'font-size': fontSize = 'inherit',
        'font-weight': fontWeight = 'bold',
    } = label.attrs ? label.attrs.text : {};
    return {
        fill, stroke, strokeWidth, fontFamily, fontSize,
        fontWeight: fontWeight as CSSProperties['fontWeight'],
    };
}

function getLabelRectAttributes(label: LinkLabelProperties): CSSProperties {
    const {
        fill = 'white',
        stroke = 'none',
        'stroke-width': strokeWidth = 0,
    } = label.attrs && label.attrs.rect ? label.attrs.rect : {};
    return {fill, stroke, strokeWidth};
}

interface LabelAttributes {
    offset: number;
    text: LocalizedString;
    attributes: {
        text: CSSProperties;
        rect: CSSProperties;
    };
}

interface LinkLabelProps {
    x: number;
    y: number;
    line: number;
    label: LabelAttributes;
    textAnchor: 'start' | 'middle' | 'end';
}

interface LinkLabelState {
    readonly width?: number;
    readonly height?: number;
}

const GROUPED_LABEL_MARGIN = 2;

class LinkLabel extends Component<LinkLabelProps, LinkLabelState> {
    private text: SVGTextElement | undefined;
    private shouldUpdateBounds = true;

    constructor(props: LinkLabelProps) {
        super(props);
        this.state = {width: 0, height: 0};
    }

    render() {
        const {x, y, label, textAnchor, line} = this.props;
        const {width, height} = this.state;

        const rectPosition = {x, y: y - height / 2};
        if (textAnchor === 'middle') {
            rectPosition.x -= width / 2;
        } else if (textAnchor === 'end') {
            rectPosition.x -= width;
        }

        const transform = line === 0 ? undefined :
            `translate(0, ${line * (height + GROUPED_LABEL_MARGIN)}px)`;
        // HACK: 'alignment-baseline' and 'dominant-baseline' are not supported in Edge and IE
        const dy = '0.6ex';

        return (
          <g style={transform ? {transform} : undefined}>
              <rect x={rectPosition.x} y={rectPosition.y}
                  width={width} height={height}
                  style={label.attributes.rect}
              />
              <text ref={this.onTextMount}
                x={x} y={y} dy={dy}
                textAnchor={textAnchor}
                style={label.attributes.text}>
                  {label.text.text}
              </text>
          </g>
        );
    }

    private onTextMount = (text: SVGTextElement | undefined) => {
        this.text = text;
    }

    componentDidMount() {
        this.recomputeBounds(this.props);
    }

    componentWillReceiveProps(nextProps: LinkLabelProps) {
        this.shouldUpdateBounds = true;
    }

    componentDidUpdate() {
        this.recomputeBounds(this.props);
    }

    private recomputeBounds(props: LinkLabelProps) {
        if (this.shouldUpdateBounds) {
            this.shouldUpdateBounds = false;
            const bounds = this.text.getBBox();
            this.setState({
                width: bounds.width,
                height: bounds.height,
            });
        }
    }
}

class VertexTools extends Component<{
    className: string;
    model: DiagramLink;
    vertexIndex: number;
    vertexRadius: number;
    x: number;
    y: number;
    onRemove: (vertex: LinkVertex) => void;
}, {}> {
    render() {
        const {className, vertexIndex, vertexRadius, x, y} = this.props;
        const transform = `translate(${x + 2 * vertexRadius},${y - 2 * vertexRadius})scale(${vertexRadius})`;
        return (
            <g className={className} transform={transform} onMouseDown={this.onRemoveVertex}>
                <title>Remove vertex</title>
                <circle r={1} />
                <path d='M-0.5,-0.5 L0.5,0.5 M0.5,-0.5 L-0.5,0.5' strokeWidth={2 / vertexRadius} />
            </g>
        );
    }

    private onRemoveVertex = (e: React.MouseEvent<SVGElement>) => {
        if (e.button !== 0 /* left button */) { return; }
        e.preventDefault();
        e.stopPropagation();
        const {onRemove, model, vertexIndex} = this.props;
        onRemove(new LinkVertex(model, vertexIndex));
    }
}

export class LinkMarkers extends Component<{ view: DiagramView }, {}> {
    private readonly listener = new EventObserver();
    private readonly delayedUpdate = new Debouncer();

    render() {
        const {view} = this.props;
        const markers: Array<ReactElement<LinkMarkerProps>> = [];

        view.getLinkTemplates().forEach((template, linkTypeId) => {
            const type = view.model.getLinkType(linkTypeId);
            if (!type) { return; }

            const typeIndex = type.index;
            if (template.markerSource) {
                markers.push(
                    <LinkMarker key={typeIndex * 2}
                        linkTypeIndex={typeIndex}
                        style={template.markerSource}
                        isStartMarker={true}
                    />
                );
            }
            if (template.markerTarget) {
                markers.push(
                    <LinkMarker key={typeIndex * 2 + 1}
                        linkTypeIndex={typeIndex}
                        style={template.markerTarget}
                        isStartMarker={false}
                    />
                );
            }
        });

        return <defs>{markers}</defs>;
    }

    componentDidMount() {
        const {view} = this.props;
        this.listener.listen(view.events, 'syncUpdate', ({layer}) => {
            if (layer !== RenderingLayer.Link) { return; }
            this.delayedUpdate.runSynchronously();
        });
        this.listener.listen(view.events, 'changeLinkTemplates', () => {
            this.delayedUpdate.call(() => this.forceUpdate());
        });
    }

    shouldComponentUpdate() {
        return false;
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.delayedUpdate.dispose();
    }
}

const SVG_NAMESPACE: 'http://www.w3.org/2000/svg' = 'http://www.w3.org/2000/svg';

interface LinkMarkerProps {
    linkTypeIndex: number;
    isStartMarker: boolean;
    style: LinkMarkerStyle;
}

class LinkMarker extends Component<LinkMarkerProps, {}> {
    render() {
        return <marker ref={this.onMarkerMount}></marker>;
    }

    shouldComponentUpdate() {
        return false;
    }

    private onMarkerMount = (marker: SVGMarkerElement) => {
        if (!marker) { return; }

        const {linkTypeIndex, isStartMarker, style} = this.props;

        marker.setAttribute('id', linkMarkerKey(linkTypeIndex, isStartMarker));
        marker.setAttribute('markerWidth', style.width.toString());
        marker.setAttribute('markerHeight', style.height.toString());
        marker.setAttribute('orient', 'auto');

        const xOffset = isStartMarker ? 0 : (style.width - 1);
        marker.setAttribute('refX', xOffset.toString());
        marker.setAttribute('refY', (style.height / 2).toString());
        marker.setAttribute('markerUnits', 'userSpaceOnUse');

        const path = document.createElementNS(SVG_NAMESPACE, 'path');
        path.setAttribute('d', style.d);
        if (style.fill !== undefined) { path.setAttribute('fill', style.fill); }
        if (style.stroke !== undefined) { path.setAttribute('stroke', style.stroke); }
        if (style.strokeWidth !== undefined) { path.setAttribute('stroke-width', style.strokeWidth); }

        marker.appendChild(path);
    }
}
