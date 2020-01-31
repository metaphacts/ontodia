import * as React from 'react';
import { findDOMNode } from 'react-dom';
import { hcl } from 'd3-color';

import { Property, ElementTypeIri, PropertyTypeIri } from '../data/model';
import { TemplateProps } from '../customization/props';
import { Debouncer } from '../viewUtils/async';
import { EventObserver } from '../viewUtils/events';
import { PropTypes } from '../viewUtils/react';
import { KeyedObserver, observeElementTypes, observeProperties } from '../viewUtils/keyedObserver';

import { setElementExpanded } from './commands';
import { Element } from './elements';
import { DiagramView, RenderingLayer, IriClickIntent } from './view';

export interface Props {
    view: DiagramView;
    group?: string;
    style: React.CSSProperties;
}

interface State {
    readonly elementStates?: ReadonlyMap<string, ElementState>;
}

interface ElementState {
    element: Element;
    templateProps: TemplateProps;
    blurred: boolean;
}

// tslint:disable:no-bitwise
enum RedrawFlags {
    None = 0,
    Render = 1,
    RecomputeTemplate = 1 | 2,
    RecomputeBlurred = 1 | 4,
}
// tslint:enable:no-bitwise

interface RedrawBatch {
    requests: Map<string, RedrawFlags>;
    forAll: RedrawFlags;
}

interface SizeUpdateRequest {
    element: Element;
    node: HTMLDivElement;
}

export class ElementLayer extends React.Component<Props, State> {
    private readonly listener = new EventObserver();

    private redrawBatch: RedrawBatch = {
        requests: new Map<string, RedrawFlags>(),
        forAll: RedrawFlags.None,
    };
    private delatedRedraw = new Debouncer();

    private sizeRequests = new Map<string, SizeUpdateRequest>();
    private delayedUpdateSizes = new Debouncer();

    private layer: HTMLDivElement;

    constructor(props: Props, context: any) {
        super(props, context);
        const {view, group} = this.props;
        this.state = {
            elementStates: applyRedrawRequests(
                view,
                group,
                this.redrawBatch,
                new Map<string, ElementState>()
            )
        };
    }

    render() {
        const {view, style} = this.props;
        const {elementStates} = this.state;

        const elementsToRender: ElementState[] = [];
        for (const {id} of view.model.elements) {
            const state = elementStates.get(id);
            if (state) {
                elementsToRender.push(state);
            }
        }

        return <div className='ontodia-element-layer'
            ref={this.onMount}
            style={style}>
            {elementsToRender.map(state => {
                const overlayElement = (
                    <OverlayedElement key={state.element.id}
                        state={state}
                        view={view}
                        onInvalidate={this.requestRedraw}
                        onResize={this.requestSizeUpdate}
                    />
                );
                const elementDecorator = view._decorateElement(state.element);
                if (elementDecorator) {
                    return (
                        <div key={state.element.id}>
                            {overlayElement}
                            {elementDecorator}
                        </div>
                    );
                }
                return overlayElement;
            })}
        </div>;
    }

    private onMount = (layer: HTMLDivElement) => {
        this.layer = layer;
    }

    componentDidMount() {
        const {view} = this.props;
        this.listener.listen(view.model.events, 'changeCells', e => {
            if (e.updateAll) {
                this.requestRedrawAll(RedrawFlags.None);
            } else {
                if (e.changedElement) {
                    this.requestRedraw(e.changedElement, RedrawFlags.None);
                }
            }
        });
        this.listener.listen(view.events, 'changeLanguage', () => {
            this.requestRedrawAll(RedrawFlags.RecomputeTemplate);
        });
        this.listener.listen(view.events, 'changeHighlight', () => {
            this.requestRedrawAll(RedrawFlags.RecomputeBlurred);
        });
        this.listener.listen(view.model.events, 'elementEvent', ({data}) => {
            const invalidatesTemplate = data.changeData || data.changeExpanded || data.changeElementState;
            if (invalidatesTemplate) {
                this.requestRedraw(invalidatesTemplate.source, RedrawFlags.RecomputeTemplate);
            }
            const invalidatesRender = data.changePosition || data.requestedRedraw;
            if (invalidatesRender) {
                this.requestRedraw(invalidatesRender.source, RedrawFlags.Render);
            }
        });
        this.listener.listen(view.events, 'syncUpdate', ({layer}) => {
            if (layer === RenderingLayer.Element) {
                this.delatedRedraw.runSynchronously();
            } else if (layer === RenderingLayer.ElementSize) {
                this.delayedUpdateSizes.runSynchronously();
            }
        });
    }

    componentWillReceiveProps(nextProps: Props) {
        if (this.props.group !== nextProps.group) {
            this.setState((state): State => ({
                elementStates: applyRedrawRequests(
                    nextProps.view,
                    nextProps.group,
                    this.redrawBatch,
                    state.elementStates
                )
            }));
        }
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.delatedRedraw.dispose();
        this.delayedUpdateSizes.dispose();
    }

    private requestRedraw = (element: Element, request: RedrawFlags) => {
        // tslint:disable:no-bitwise
        const flagsWithForAll = this.redrawBatch.forAll | request;
        if (flagsWithForAll === this.redrawBatch.forAll) {
            // forAll flags already include the request
            return;
        }
        const existing = this.redrawBatch.requests.get(element.id);
        this.redrawBatch.requests.set(element.id, existing | request);
        this.delatedRedraw.call(this.redrawElements);
        // tslint:enable:no-bitwise
    }

    private requestRedrawAll(request: RedrawFlags) {
        // tslint:disable-next-line:no-bitwise
        this.redrawBatch.forAll |= request;
        this.delatedRedraw.call(this.redrawElements);
    }

    private redrawElements = () => {
        const props = this.props;
        this.setState((state): State => ({
            elementStates: applyRedrawRequests(
                props.view,
                props.group,
                this.redrawBatch,
                state.elementStates
            )
        }));
    }

    private requestSizeUpdate = (element: Element, node: HTMLDivElement) => {
        this.sizeRequests.set(element.id, {element, node});
        this.delayedUpdateSizes.call(this.recomputeQueuedSizes);
    }

    private recomputeQueuedSizes = () => {
        const batch = this.sizeRequests;
        this.sizeRequests = new Map<string, SizeUpdateRequest>();
        batch.forEach(({element, node}) => {
            const {clientWidth, clientHeight} = node;
            element.setSize({width: clientWidth, height: clientHeight});
        });
    }
}

function applyRedrawRequests(
    view: DiagramView,
    targetGroup: string | undefined,
    batch: RedrawBatch,
    previous: ReadonlyMap<string, ElementState>,
): ReadonlyMap<string, ElementState> {
    const computed = new Map<string, ElementState>();
    for (const element of view.model.elements) {
        if (element.group !== targetGroup) { continue; }
        const elementId = element.id;
        if (previous.has(elementId)) {
            let state = previous.get(elementId);
            // tslint:disable:no-bitwise
            const request = (batch.requests.get(elementId) || RedrawFlags.None) | batch.forAll;
            if (request & RedrawFlags.Render) {
                state = {
                    element,
                    templateProps:
                        (request & RedrawFlags.RecomputeTemplate) === RedrawFlags.RecomputeTemplate
                        ? computeTemplateProps(state.element, view) : state.templateProps,
                    blurred:
                        (request & RedrawFlags.RecomputeBlurred) === RedrawFlags.RecomputeBlurred
                        ? computeIsBlurred(state.element, view) : state.blurred,
                };
            }
            computed.set(elementId, state);
            batch.requests.delete(elementId);
            // tslint:enable:no-bitwise
        } else {
            computed.set(element.id, {
                element,
                templateProps: computeTemplateProps(element, view),
                blurred: computeIsBlurred(element, view),
            });
        }
    }
    batch.forAll = RedrawFlags.None;
    return computed;
}

interface OverlayedElementProps {
    state: ElementState;
    view: DiagramView;
    onInvalidate: (model: Element, request: RedrawFlags) => void;
    onResize: (model: Element, node: HTMLDivElement) => void;
}

export interface ElementContextWrapper { ontodiaElement: ElementContext; }
export const ElementContextTypes: { [K in keyof ElementContextWrapper]: any } = {
    ontodiaElement: PropTypes.anything,
};

export interface ElementContext {
    element: Element;
}

class OverlayedElement extends React.Component<OverlayedElementProps, {}> {
    static childContextTypes = ElementContextTypes;

    private readonly listener = new EventObserver();
    private disposed = false;

    private typesObserver: KeyedObserver<ElementTypeIri>;
    private propertiesObserver: KeyedObserver<PropertyTypeIri>;

    getChildContext(): ElementContextWrapper {
        const ontodiaElement: ElementContext = {
            element: this.props.state.element,
        };
        return {ontodiaElement};
    }

    private rerenderTemplate = () => {
        if (this.disposed) { return; }
        this.props.onInvalidate(this.props.state.element, RedrawFlags.RecomputeTemplate);
    }

    render(): React.ReactElement<any> {
        const {state: {element, blurred}} = this.props;
        if (element.temporary) {
            return <div />;
        }

        const {x = 0, y = 0} = element.position;
        const transform = `translate(${x}px,${y}px)`;

        // const angle = model.get('angle') || 0;
        // if (angle) { transform += `rotate(${angle}deg)`; }

        const className = (
            `ontodia-overlayed-element ${blurred ? 'ontodia-overlayed-element--blurred' : ''}`
        );
        return <div className={className}
            // set `element-id` to translate mouse events to paper
            data-element-id={element.id}
            style={{position: 'absolute', transform}}
            tabIndex={0}
            ref={this.onMount}
            // resize element when child image loaded
            onLoad={this.onLoadOrErrorEvent}
            onError={this.onLoadOrErrorEvent}
            onClick={this.onClick}
            onDoubleClick={this.onDoubleClick}>
            <TemplatedElement {...this.props} />
        </div>;
    }

    private onMount = (node: HTMLDivElement | undefined) => {
        if (!node) { return; }
        const {state, onResize} = this.props;
        onResize(state.element, node);
    }

    private onLoadOrErrorEvent = () => {
        const {state, onResize} = this.props;
        onResize(state.element, findDOMNode(this) as HTMLDivElement);
    }

    private onClick = (e: React.MouseEvent<EventTarget>) => {
        if (e.target instanceof HTMLElement && e.target.localName === 'a') {
            const anchor = e.target as HTMLAnchorElement;
            const {view, state} = this.props;
            const clickIntent = e.target.getAttribute('data-iri-click-intent') === IriClickIntent.OpenEntityIri ?
                IriClickIntent.OpenEntityIri : IriClickIntent.OpenOtherIri;
            view.onIriClick(decodeURI(anchor.href), state.element, clickIntent, e);
        }
    }

    private onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        const {view, state: {element}} = this.props;
        view.model.history.execute(
            setElementExpanded(element, !element.isExpanded)
        );
    }

    componentDidMount() {
        const {state, view} = this.props;
        this.listener.listen(state.element.events, 'requestedFocus', () => {
            const element = findDOMNode(this) as HTMLElement;
            if (element) { element.focus(); }
        });
        this.typesObserver = observeElementTypes(
            view.model, 'changeLabel', this.rerenderTemplate
        );
        this.propertiesObserver = observeProperties(
            view.model, 'changeLabel', this.rerenderTemplate
        );
        this.observeTypes();
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.typesObserver.stopListening();
        this.propertiesObserver.stopListening();
        this.disposed = true;
    }

    shouldComponentUpdate(nextProps: OverlayedElementProps) {
        return this.props.state !== nextProps.state;
    }

    componentDidUpdate() {
        this.observeTypes();
        this.props.onResize(this.props.state.element, findDOMNode(this) as HTMLDivElement);
    }

    private observeTypes() {
        const {state: {element}} = this.props;
        this.typesObserver.observe(element.data.types);
        this.propertiesObserver.observe(Object.keys(element.data.properties) as PropertyTypeIri[]);
    }
}

class TemplatedElement extends React.Component<OverlayedElementProps, {}> {
    private cachedTemplateClass: React.ComponentClass<TemplateProps>;
    private cachedTemplateProps: TemplateProps;

    render() {
        const {state, view} = this.props;
        const {element, templateProps} = state;
        const templateClass = view.getElementTemplate(element.data.types);
        this.cachedTemplateClass = templateClass;
        this.cachedTemplateProps = templateProps;
        return React.createElement(templateClass, templateProps);
    }

    shouldComponentUpdate(nextProps: OverlayedElementProps) {
        const templateClass = nextProps.view.getElementTemplate(nextProps.state.element.data.types);
        return !(
            this.cachedTemplateClass === templateClass &&
            this.cachedTemplateProps === nextProps.state.templateProps
        );
    }
}

function computeTemplateProps(model: Element, view: DiagramView): TemplateProps {
    const types = model.data.types.length > 0
        ? view.getElementTypeString(model.data) : 'Thing';
    const label = view.formatLabel(model.data.label.values, model.iri);
    const {color, icon} = computeStyleFor(model, view);
    const propsAsList = computePropertyTable(model, view);

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

function computePropertyTable(
    model: Element, view: DiagramView
): Array<{ id: string; name: string; property: Property }> {
    if (!model.data.properties) { return []; }

    const propertyIris = Object.keys(model.data.properties) as PropertyTypeIri[];
    const propTable = propertyIris.map(key => {
        const property = view.model.createProperty(key);
        const name = view.formatLabel(property.label, key);
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

function computeStyleFor(model: Element, view: DiagramView) {
    const {color: {h, c, l}, icon} = view.getTypeStyle(model.data.types);
    return {
        icon,
        color: hcl(h, c, l).toString(),
    };
}

function computeIsBlurred(element: Element, view: DiagramView): boolean {
    return view.highlighter && !view.highlighter(element);
}
