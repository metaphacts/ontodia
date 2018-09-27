import * as React from 'react';
import { findDOMNode } from 'react-dom';
import { hcl } from 'd3-color';

import { Property, ElementTypeIri, PropertyTypeIri } from '../data/model';
import { TemplateProps } from '../customization/props';
import { Debouncer } from '../viewUtils/async';
import { createStringMap } from '../viewUtils/collections';
import { EventObserver, Unsubscribe } from '../viewUtils/events';
import { PropTypes } from '../viewUtils/react';
import { KeyedObserver, observeElementTypes, observeProperties } from '../viewUtils/keyedObserver';

import { setElementExpanded } from './commands';
import { Element } from './elements';
import { formatLocalizedLabel } from './model';
import { DiagramView, RenderingLayer } from './view';

export interface Props {
    view: DiagramView;
    group?: string;
    style: React.CSSProperties;
}

interface BatchUpdateItem {
    element: Element;
    node: HTMLDivElement;
}

export class ElementLayer extends React.Component<Props, {}> {
    private readonly listener = new EventObserver();

    private batch = createStringMap<BatchUpdateItem>();
    private renderElements = new Debouncer();
    private updateSizes = new Debouncer();

    private layer: HTMLDivElement;

    render() {
        const {view, group, style} = this.props;
        const models = view.model.elements.filter(model => model.group === group);

        return <div className='ontodia-element-layer'
            ref={this.onMount}
            style={style}>
            {models.map(model => <OverlayedElement key={model.id}
                model={model}
                view={view}
                onResize={this.updateElementSize}
                onRender={this.updateElementSize} />)}
        </div>;
    }

    private onMount = (layer: HTMLDivElement) => {
        this.layer = layer;
    }

    componentDidMount() {
        const {view} = this.props;
        this.listener.listen(view.model.events, 'changeCells', () => {
            this.renderElements.call(this.performRendering);
        });
        this.listener.listen(view.events, 'syncUpdate', ({layer}) => {
            if (layer === RenderingLayer.Element) {
                this.renderElements.runSynchronously();
            } else if (layer === RenderingLayer.ElementSize) {
                this.updateSizes.runSynchronously();
            }
        });
    }

    componentDidUpdate() {
        this.updateSizes.call(this.recomputeQueuedSizes);
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.renderElements.dispose();
        this.updateSizes.dispose();
    }

    private performRendering = () => {
        this.forceUpdate();
    }

    private updateElementSize = (element: Element, node: HTMLDivElement) => {
        this.batch[element.id] = {element, node};
        this.updateSizes.call(this.recomputeQueuedSizes);
    }

    private recomputeQueuedSizes = () => {
        const batch = this.batch;
        this.batch = createStringMap<BatchUpdateItem>();

        // hasOwnProperty() check is unneccessary here because of `createStringMap`
        // tslint:disable-next-line:forin
        for (const id in batch) {
            const {element, node} = batch[id];
            const {clientWidth, clientHeight} = node;
            element.setSize({width: clientWidth, height: clientHeight});
        }
    }
}

interface OverlayedElementProps {
    view: DiagramView;
    model: Element;
    onResize: (model: Element, node: HTMLDivElement) => void;
    onRender: (model: Element, node: HTMLDivElement) => void;
}

interface OverlayedElementState {
    readonly templateProps?: TemplateProps;
}

export interface ElementContextWrapper { ontodiaElement: ElementContext; }
export const ElementContextTypes: { [K in keyof ElementContextWrapper]: any } = {
    ontodiaElement: PropTypes.anything,
};

export interface ElementContext {
    element: Element;
}

class OverlayedElement extends React.Component<OverlayedElementProps, OverlayedElementState> {
    static childContextTypes = ElementContextTypes;

    private readonly listener = new EventObserver();
    private disposed = false;

    private typesObserver: KeyedObserver<ElementTypeIri>;
    private propertiesObserver: KeyedObserver<PropertyTypeIri>;

    constructor(props: OverlayedElementProps) {
        super(props);
        this.state = {
            templateProps: this.templateProps(),
        };
    }

    getChildContext(): ElementContextWrapper {
        const ontodiaElement: ElementContext = {
            element: this.props.model,
        };
        return {ontodiaElement};
    }

    private rerenderTemplate = () => {
        if (this.disposed) { return; }
        this.setState({templateProps: this.templateProps()});
    }

    render(): React.ReactElement<any> {
        const {model, view, onResize, onRender} = this.props;
        if (model.temporary) {
            return <div />;
        }

        const template = view.getElementTemplate(model.data.types);

        const {x = 0, y = 0} = model.position;
        const transform = `translate(${x}px,${y}px)`;

        // const angle = model.get('angle') || 0;
        // if (angle) { transform += `rotate(${angle}deg)`; }

        return <div className='ontodia-overlayed-element'
            // set `element-id` to translate mouse events to paper
            data-element-id={model.id}
            style={{position: 'absolute', transform}}
            tabIndex={0}
            ref={this.onMount}
            // resize element when child image loaded
            onLoad={this.onLoadOrErrorEvent}
            onError={this.onLoadOrErrorEvent}
            onClick={this.onClick}
            onDoubleClick={this.onDoubleClick}>
            {React.createElement(template, this.state.templateProps)}
        </div>;
    }

    private onMount = (node: HTMLDivElement | undefined) => {
        if (!node) { return; }
        const {onRender, model} = this.props;
        onRender(model, node);
    }

    private onLoadOrErrorEvent = () => {
        const {onResize, model} = this.props;
        onResize(model, findDOMNode(this) as HTMLDivElement);
    }

    private onClick = (e: React.MouseEvent<EventTarget>) => {
        if (e.target instanceof HTMLElement && e.target.localName === 'a') {
            const anchor = e.target as HTMLAnchorElement;
            const {view, model} = this.props;
            view.onIriClick(anchor.href, model, e);
        }
    }

    private onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        const {view, model} = this.props;
        view.model.history.execute(
            setElementExpanded(model, !model.isExpanded)
        );
    }

    componentDidMount() {
        const {model, view} = this.props;
        this.listener.listen(view.events, 'changeLanguage', this.rerenderTemplate);
        this.listener.listen(model.events, 'changeData', this.rerenderTemplate);
        this.listener.listen(model.events, 'changeExpanded', this.rerenderTemplate);
        this.listener.listen(model.events, 'changePosition', () => this.forceUpdate());
        this.listener.listen(model.events, 'requestedRedraw', () => this.forceUpdate());
        this.listener.listen(model.events, 'requestedFocus', () => {
            const element = findDOMNode(this) as HTMLElement;
            if (element) { element.focus(); }
        });
        this.typesObserver = observeElementTypes(
            this.props.view.model, 'changeLabel', this.rerenderTemplate
        );
        this.propertiesObserver = observeProperties(
            this.props.view.model, 'changeLabel', this.rerenderTemplate
        );
        this.observeTypes();
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.typesObserver.stopListening();
        this.propertiesObserver.stopListening();
        this.disposed = true;
    }

    shouldComponentUpdate(nextProps: OverlayedElementProps, nextState: OverlayedElementState) {
        return nextState !== this.state;
    }

    componentDidUpdate() {
        this.observeTypes();
        this.props.onResize(this.props.model, findDOMNode(this) as HTMLDivElement);
    }

    private observeTypes() {
        const {model} = this.props;
        this.typesObserver.observe(model.data.types);
        this.propertiesObserver.observe(Object.keys(model.data.properties) as PropertyTypeIri[]);
    }

    private templateProps(): TemplateProps {
        const {model, view} = this.props;

        const types = model.data.types.length > 0
            ? view.getElementTypeString(model.data) : 'Thing';
        const label = formatLocalizedLabel(model.iri, model.data.label.values, view.getLanguage());
        const {color, icon} = this.styleFor(model);
        const propsAsList = this.getPropertyTable();

        return {
            elementId: model.id,
            data: model.data,
            iri: model.iri,
            types,
            label,
            color,
            iconUrl: icon,
            imgUrl: model.data.image,
            isExpanded: model.isExpanded,
            props: model.data.properties,
            propsAsList,
        };
    }

    private getPropertyTable(): Array<{ id: string; name: string; property: Property }> {
        const {model, view} = this.props;

        if (!model.data.properties) { return []; }

        const propertyIris = Object.keys(model.data.properties) as PropertyTypeIri[];
        const propTable = propertyIris.map(key => {
            const property = view.model.createProperty(key);
            const name = formatLocalizedLabel(key, property.label, view.getLanguage());
            return {
                id: key,
                name: name,
                property: model.data.properties[key],
            };
        });

        propTable.sort((a, b) => {
            const aLabel = (a.name || a.id).toLowerCase();
            const bLabel = (b.name || b.id).toLowerCase();
            return aLabel.localeCompare(bLabel);
        });
        return propTable;
    }

    private styleFor(model: Element) {
        const {color: {h, c, l}, icon} = this.props.view.getTypeStyle(model.data.types);
        return {
            icon,
            color: hcl(h, c, l).toString(),
        };
    }
}
