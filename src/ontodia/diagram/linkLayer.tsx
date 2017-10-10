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
    Vector, boundsOf, centerOfRectangle, intersectRayFromRectangleCenter, computePolylineLength, getPointAlongPolyline,
} from './geometry';
import { DefaultLinkRouter } from './linkRouter';
import { DiagramModel } from './model';
import { DiagramView, RenderingLayer } from './view';

export interface LinkLayerProps {
    view: DiagramView;
}

export class LinkLayer extends Component<LinkLayerProps, {}> {
    private readonly listener = new EventObserver();
    private readonly delayedUpdate = new Debouncer();

    // /** List of link IDs to update at the next flush event */
    // private pendingUpdates: string[] = [];

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
        this.listener.listenTo(graph, 'change:position change:size', this.scheduleUpdateAll);
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
        this.delayedUpdate.call(this.updateAll);
    }

    private updateAll = () => {
        this.updateRoutings();
        this.forceUpdate();
    }

    private updateRoutings() {
        this.routings = this.router.route(this.props.view.model);
    }

    render() {
        const {view} = this.props;
        return <g>
            {view.model.links.map(model => (
                <LinkView key={model.id}
                    view={view}
                    model={model as DiagramLink}
                    route={this.routings[model.id]}
                />
            ))}
        </g>;
    }
}

interface LinkViewProps {
    view: DiagramView;
    model: DiagramLink;
    route?: RoutedLink;
}

class LinkView extends Component<LinkViewProps, void> {
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

        const vertices: Array<{ x: number; y: number; }> = route ? route.vertices : (model.get('vertices') || []);

        const sourceRect = boundsOf(source);
        const targetRect = boundsOf(target);

        const startPoint = intersectRayFromRectangleCenter(
            sourceRect, vertices.length > 0 ? vertices[0] : centerOfRectangle(targetRect));
        const endPoint = intersectRayFromRectangleCenter(
            targetRect, vertices.length > 0 ? vertices[vertices.length - 1] : centerOfRectangle(sourceRect));
        const polyline = [startPoint, ...vertices, endPoint];

        const path = 'M' + polyline.map(({x, y}) => `${x},${y}`).join(' L');

        const style = this.template.renderLink(model.template);
        const pathAttributes = this.getPathAttributes(style);

        return (
            <g data-link-id={model.id} data-source-id={source.id} data-target-id={target.id}>
                <path className='connection' d={path} {...pathAttributes}
                    markerStart={`url(#${linkMarkerKey(typeIndex, true)})`}
                    markerEnd={`url(#${linkMarkerKey(typeIndex, false)})`} />
                <path className='connection-wrap' d={path} stroke='none' fill='none' />
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
            fill: 'none',
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
            <g className='labels'>
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

export class LinkMarkers extends Component<{ view: DiagramView }, void> {
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

class LinkMarker extends Component<LinkMarkerProps, void> {
    render() {
        return <marker ref={this.onMarkerMount}></marker>;
    }

    shouldComponentUpdate() {
        return false;
    }

    private onMarkerMount = (marker: SVGMarkerElement) => {
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
