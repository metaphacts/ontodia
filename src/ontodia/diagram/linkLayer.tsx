import * as React from 'react';
import { Component, ReactElement, SVGAttributes, CSSProperties } from 'react';

import { LocalizedString } from '../data/model';
import { Debouncer } from '../diagram/dataFetchingThread';
import {
    LinkTemplate, LinkStyle, LinkLabel, LinkMarkerStyle,
    LinkRouter, RoutedLinks, RoutedLink,
} from '../customization/props';
import { EventObserver } from '../viewUtils/events';

import { Element as DiagramElement, Link as DiagramLink, linkMarkerKey } from './elements';
import {
    Vector, computePolyline, computePolylineLength, getPointAlongPolyline,
} from './geometry';
import { DefaultLinkRouter } from './linkRouter';
import { DiagramModel } from './model';
import { DiagramView, RenderingLayer } from './view';

export interface LinkLayerProps {
    view: DiagramView;
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

    private router: LinkRouter;
    private routings: RoutedLinks;

    constructor(props: LinkLayerProps, context: any) {
        super(props, context);
        this.router = this.props.view.options.linkRouter || new DefaultLinkRouter();
        this.updateRoutings();
    }

    componentDidMount() {
        const {view} = this.props;
        const graph = view.model.graph;

        this.listener.listenTo(graph, 'add remove reset', this.scheduleUpdateAll);
        this.listener.listenTo(graph, 'change:position change:size', (element: DiagramElement) => {
            for (const link of element.links) {
                this.scheduleUpdateLink(link.id);
            }
        });
        this.listener.listenTo(graph, 'change:vertices', (link: DiagramLink) => {
            this.scheduleUpdateLink(link.id);
        });
        this.listener.listen(view.syncUpdate, ({layer}) => {
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
        this.updateRoutings();
        this.forceUpdate();
    }

    private updateRoutings() {
        this.routings = this.router.route(this.props.view.model);
    }

    render() {
        const {view, group} = this.props;
        const shouldUpdate = this.popShouldUpdatePredicate();

        const links = view.model.links.filter(link => {
            const source = view.model.getElement(link.sourceId);
            const target = view.model.getElement(link.targetId);

            return source.template.group === group && target.template.group === group;
        });

        return <g className={CLASS_NAME}>
            {links.map(model => (
                <LinkView key={model.id}
                    view={view}
                    model={model}
                    shouldUpdate={shouldUpdate(model)}
                    route={this.routings[model.id]}
                />
            ))}
        </g>;
    }
}

function createStringMap<V>(): { [key: string]: V } {
    const map = Object.create(null);
    // tslint:disable-next-line:no-string-literal
    delete map['hint'];
    return map;
}

interface LinkViewProps {
    view: DiagramView;
    model: DiagramLink;
    shouldUpdate: boolean;
    route?: RoutedLink;
}

const LINK_CLASS = 'ontodia-link';

class LinkView extends Component<LinkViewProps, {}> {
    private templateTypeId: string;
    private template: LinkTemplate;

    constructor(props: LinkViewProps, context: any) {
        super(props, context);
        this.grabLinkTemplate();
    }

    componentWillReceiveProps(nextProps: LinkViewProps) {
        if (this.templateTypeId !== nextProps.model.typeId) {
            this.grabLinkTemplate();
        }
    }

    shouldComponentUpdate(nextProps: LinkViewProps, nextState: {}) {
        return nextProps.shouldUpdate;
    }

    private grabLinkTemplate() {
        this.templateTypeId = this.props.model.typeId;
        this.template = this.props.view.createLinkTemplate(this.templateTypeId);
    }

    render() {
        const {view, model, route} = this.props;
        const typeIndex = model.typeIndex;
        const source = view.model.getElement(model.sourceId);
        const target = view.model.getElement(model.targetId);
        if (!(source && target)) {
            return null;
        }

        const verticesDefinedByUser = model.vertices || [];
        const vertices = route ? route.vertices : verticesDefinedByUser;
        const polyline = computePolyline(source, target, vertices);

        const path = 'M' + polyline.map(({x, y}) => `${x},${y}`).join(' L');

        const style = this.template.renderLink(model.template);
        const pathAttributes = this.getPathAttributes(style);

        return (
            <g className={LINK_CLASS} data-link-id={model.id} data-source-id={source.id} data-target-id={target.id}>
                <path className={`${LINK_CLASS}__connection`} d={path} {...pathAttributes}
                    markerStart={`url(#${linkMarkerKey(typeIndex, true)})`}
                    markerEnd={`url(#${linkMarkerKey(typeIndex, false)})`} />
                <path className={`${LINK_CLASS}__wrap`} d={path} />
                {this.renderLabels(polyline, style)}
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
                    vertexRadius={vertexRadius} x={x} y={y} />
            );
            index++;
        }

        return <g className={`${LINK_CLASS}__vertices`}>{elements}</g>;
    }

    private getPathAttributes(style: LinkStyle): SVGAttributes<SVGPathElement> {
        const {model} = this.props;

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

    private renderLabels(polyline: ReadonlyArray<Vector>, style: LinkStyle) {
        const {view, model, route} = this.props;
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

        let textAnchor = 'middle';
        if (route && route.labelTextAnchor) {
            textAnchor = route.labelTextAnchor;
        }

        return (
            <g className={`${LINK_CLASS}__labels`}>
                {labels.map((label, index) => {
                    const {x, y} = getPointAlongPolyline(polyline, polylineLength * label.offset);
                    // missing from typings
                    const otherAttributes: object = {alignmentBaseline: 'middle'};
                    return (
                        <text key={index} x={x} y={y} textAnchor={textAnchor}
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

class VertexTools extends Component<{
    className: string;
    model: DiagramLink;
    vertexIndex: number;
    vertexRadius: number;
    x: number;
    y: number;
}, {}> {
    render() {
        const {className, vertexIndex, vertexRadius, x, y} = this.props;
        let transform = `translate(${x + 2 * vertexRadius},${y - 2 * vertexRadius})scale(${vertexRadius})`;
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
        const {model, vertexIndex} = this.props;
        const vertices = [...model.vertices];
        vertices.splice(vertexIndex, 1);
        model.setVertices(vertices);
    }
}

export class LinkMarkers extends Component<{ view: DiagramView }, {}> {
    private readonly listener = new EventObserver();
    private readonly delayedUpdate = new Debouncer();

    render() {
        const {view} = this.props;
        const templates = view.getLinkTemplates();
        const markers: Array<ReactElement<LinkMarkerProps>> = [];

        for (const linkTypeId in templates) {
            if (!templates.hasOwnProperty(linkTypeId)) { continue; }
            const template = templates[linkTypeId];
            const typeIndex = view.model.getLinkType(linkTypeId).index;
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
        }

        return <defs>{markers}</defs>;
    }

    componentDidMount() {
        const {view} = this.props;
        this.listener.listen(view.syncUpdate, ({layer}) => {
            if (layer !== RenderingLayer.Link) { return; }
            this.delayedUpdate.runSynchronously();
        });
        this.listener.listen(view.linkTemplatesChanged, () => {
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

        let xOffset = isStartMarker ? 0 : (style.width - 1);
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
