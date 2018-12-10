import * as React from 'react';

import { ElementIri, LinkModel } from '../data/model';

import { Vector, boundsOf, computePolyline, getPointAlongPolyline, computePolylineLength } from '../diagram/geometry';
import { TransformedSvgCanvas } from '../diagram/paper';
import { PaperWidgetProps } from '../diagram/paperArea';
import { DiagramView, RenderingLayer } from '../diagram/view';
import { Link, Element } from '../diagram/elements';
import { formatLocalizedLabel } from '../diagram/model';

import { Debouncer } from '../viewUtils/async';
import { EventObserver } from '../viewUtils/events';
import { HtmlSpinner } from '../viewUtils/spinner';

import { AuthoringKind } from './authoringState';
import { EditorController } from './editorController';
import { LinkValidation, ElementValidation } from './validation';

export interface Props extends PaperWidgetProps {
    editor: EditorController;
    view: DiagramView;
}

const CLASS_NAME = `ontodia-states-widget`;
const WARNING_SIZE = 20;
const WARNING_MARGIN = 5;

const LINK_LABEL_MARGINE = 5;

export class StatesWidget extends React.Component<Props, {}> {
    private readonly listener = new EventObserver();
    private readonly delayedUpdate = new Debouncer();

    componentDidMount() {
        this.listenEvents();
    }

    componentDidUpdate(prevProps: Props) {
        const sameEventSources = (
            this.props.editor === prevProps.editor &&
            this.props.view === prevProps.view
        );
        if (!sameEventSources) {
            this.listener.stopListening();
            this.listenEvents();
        }
    }

    componentWillUnmount() {
        this.listener.stopListening();
    }

    private listenEvents() {
        const {editor, view} = this.props;
        this.listener.listen(editor.model.events, 'elementEvent',  ({data}) => {
            if (data.changeSize || data.changePosition) {
                this.scheduleUpdate();
            }
        });
        this.listener.listen(editor.model.events, 'linkEvent', ({data}) => {
            if (data.changeVertices || data.changeLabelBounds) {
                this.scheduleUpdate();
            }
        });
        this.listener.listen(editor.model.events, 'changeCells', this.scheduleUpdate);
        this.listener.listen(editor.events, 'changeAuthoringState', this.scheduleUpdate);
        this.listener.listen(editor.events, 'changeTemporaryState', this.scheduleUpdate);
        this.listener.listen(editor.events, 'changeValidationState', this.scheduleUpdate);
        this.listener.listen(view.events, 'syncUpdate', ({layer}) => {
            if (layer === RenderingLayer.Editor) {
                this.delayedUpdate.runSynchronously();
            }
        });
    }

    private scheduleUpdate = () => {
        this.delayedUpdate.call(this.performUpdate);
    }

    private performUpdate = () => {
        this.forceUpdate();
    }

    private calculateLinkPath(link: Link) {
        const polyline = this.calculatePolyline(link);
        return 'M' + polyline.map(({x, y}) => `${x},${y}`).join(' L');
    }

    private calculatePolyline(link: Link) {
        const {editor, view} = this.props;

        const source = editor.model.getElement(link.sourceId);
        const target = editor.model.getElement(link.targetId);

        const route = view.getRouting(link.id);
        const verticesDefinedByUser = link.vertices || [];
        const vertices = route ? route.vertices : verticesDefinedByUser;

        return computePolyline(source, target, vertices);
    }

    private renderLinkStateLabels() {
        const {editor} = this.props;

        return editor.model.links.map(link => {
            let renderedState: JSX.Element | null = null;
            const state = editor.authoringState.index.links.get(link.data);
            if (state) {
                const onCancel = () => editor.discardChange(state);

                let statusText: string;
                let title: string;

                if (state.type === AuthoringKind.ChangeLink && !state.before) {
                    statusText = 'New';
                    title = 'Revert creation of the link';
                } else if (state.type === AuthoringKind.ChangeLink && state.before) {
                    statusText = 'Change';
                    title = 'Revert all changes in properties of the link';
                } else if (state.type === AuthoringKind.DeleteLink) {
                    statusText = 'Delete';
                    title = 'Revert deletion of the link';
                }

                if (statusText && title) {
                    renderedState = (
                        <span>
                            <span className={`${CLASS_NAME}__state-label`}>{statusText}</span>
                            [<span className={`${CLASS_NAME}__state-cancel`}
                                    onClick={onCancel} title={title}>cancel</span>]
                        </span>
                    );
                }
            }

            const renderedErrors = this.renderLinkErrors(link.data);
            if (renderedState || renderedErrors) {
                const labelPosition = this.getLinkStateLabelPosition(link);
                if (!labelPosition) {
                    return null;
                }
                const style = {left: labelPosition.x, top: labelPosition.y};
                return <div className={`${CLASS_NAME}__state-indicator`}
                    key={link.id}
                    style={style}>
                    <div className={`${CLASS_NAME}__state-indicator-container`}>
                        <div className={`${CLASS_NAME}__state-indicator-body`}>
                            {renderedState}
                            {renderedErrors}
                        </div>
                    </div>
                </div>;
            } else {
                return null;
            }
        });
    }

    private renderLinkStateHighlighting() {
        const {editor} = this.props;
        return editor.model.links.map(link => {
            if (editor.temporaryState.links.has(link.data)) {
                const path = this.calculateLinkPath(link);
                return (
                    <path key={link.id} d={path} fill={'none'} stroke={'grey'} strokeWidth={5} strokeOpacity={0.5}
                        strokeDasharray={'8 8'} />
                );
            }
            const state = editor.authoringState.index.links.get(link.data);
            const sourceState = editor.authoringState.index.elements.get(link.data.sourceId);
            const targetState = editor.authoringState.index.elements.get(link.data.targetId);
            const sourceStateDeleted = sourceState && sourceState.type === AuthoringKind.DeleteElement;
            const targetStateDeleted = targetState && targetState.type === AuthoringKind.DeleteElement;
            if (state || sourceStateDeleted || targetStateDeleted) {
                const path = this.calculateLinkPath(link);
                let color: string;
                if (
                    state && state.type === AuthoringKind.ChangeLink &&
                    !(sourceStateDeleted || targetStateDeleted)
                ) {
                    color = state.before ? 'blue' : 'green';
                } else {
                    color = 'red';
                }
                return (
                    <path key={link.id} d={path} fill={'none'} stroke={color} strokeWidth={5} strokeOpacity={0.5} />
                );
            }
            return null;
        });
    }

    private getLinkStateLabelPosition(link: Link): Vector {
        if (link.labelBounds) {
            const {x, y} = link.labelBounds;
            return {x, y: y - LINK_LABEL_MARGINE / 2};
        } else {
            const polyline = this.calculatePolyline(link);
            const polylineLength = computePolylineLength(polyline);
            return getPointAlongPolyline(polyline, polylineLength / 2);
        }
    }

    private renderElementOutlines() {
        const {editor} = this.props;
        return editor.model.elements.map(element => {
            const {x, y, width, height} = boundsOf(element);
            if (editor.temporaryState.elements.has(element.iri)) {
                return (
                    <rect key={element.id} x={x} y={y} width={width} height={height} fill={'none'} stroke={'grey'}
                        strokeWidth={3} strokeOpacity={0.7} strokeDasharray={'8 8'} />
                );
            }
            const state = editor.authoringState.index.elements.get(element.iri);
            if (state && state.type === AuthoringKind.DeleteElement) {
                    const right = x + width;
                    const bottom = y + height;
                    return <g key={element.id}>
                        <rect x={x} y={y} width={width} height={height} fill='white' fillOpacity={0.5} />
                        <line x1={x} y1={y} x2={right} y2={bottom} stroke='red' />
                        <line x1={right} y1={y} x2={x} y2={bottom} stroke='red' />
                    </g>;
            }
            return null;
        });
    }

    private renderElementStates() {
        const {editor} = this.props;
        return editor.model.elements.reduce((acc: JSX.Element[], element) => {
            let renderedState: JSX.Element | null = null;
            const state = editor.authoringState.index.elements.get(element.iri);
            if (state) {
                const onCancel = () => editor.discardChange(state);

                let statusText: string;
                let title: string;

                if (state.type === AuthoringKind.ChangeElement && !state.before) {
                    statusText = 'New';
                    title = 'Revert creation of the element';
                } else if (state.type === AuthoringKind.ChangeElement && state.before) {
                    statusText = 'Change';
                    title = 'Revert all changes in properties of the element';
                } else if (state.type === AuthoringKind.DeleteElement) {
                    statusText = 'Delete';
                    title = 'Revert deletion of the element';
                }

                if (statusText && title) {
                    renderedState = (
                        <span>
                            <span className={`${CLASS_NAME}__state-label`}>{statusText}</span>
                            [<span className={`${CLASS_NAME}__state-cancel`}
                                    onClick={onCancel} title={title}>cancel</span>]
                        </span>
                    );
                }
            }

            const renderedErrors = this.renderElementErrors(element.iri);
            if (renderedState || renderedErrors) {
                const {x, y} = boundsOf(element);
                acc.push(
                    <div className={`${CLASS_NAME}__state-indicator`}
                        key={element.id}
                        style={{left: x, top: y}}>
                        <div className={`${CLASS_NAME}__state-indicator-container`}>
                            <div className={`${CLASS_NAME}__state-indicator-body`}>
                                {renderedState}
                                {renderedErrors}
                            </div>
                        </div>
                    </div>
                );
            }
            return acc;
        }, []);
    }

    private renderElementErrors(elementIri: ElementIri): JSX.Element | null {
        const {view, editor} = this.props;
        const validation = editor.validationState.elements.get(elementIri);
        if (!validation) {
            return null;
        }
        const title = validation.errors.map(error => {
            if (error.propertyType) {
                const {id, label} = view.model.createProperty(error.propertyType);
                const source = formatLocalizedLabel(id, label, view.getLanguage());
                return `${source}: ${error.message}`;
            } else {
                return error.message;
            }
        }).join('\n');

        return this.renderErrorIcon(title, validation);
    }

    private renderLinkErrors(linkModel: LinkModel) {
        const {editor} = this.props;
        const {validationState} = editor;

        const validation = validationState.links.get(linkModel);
        if (!validation) {
            return null;
        }
        const title = validation.errors.map(error => error.message).join('\n');

        return this.renderErrorIcon(title, validation);
    }

    private renderErrorIcon(title: string, validation: LinkValidation | ElementValidation): JSX.Element {
        return <div className={`${CLASS_NAME}__item-error`} title={title}>
            {validation.loading
                ? <HtmlSpinner width={15} height={17} />
                : <div className={`${CLASS_NAME}__item-error-icon`} />}
            {(!validation.loading && validation.errors.length > 0)
                ? validation.errors.length : undefined}
        </div>;
    }

    render() {
        const {editor, paperTransform} = this.props;
        const {scale, originX, originY} = paperTransform;
        if (!editor.inAuthoringMode) {
            return null;
        }
        const htmlTransformStyle: React.CSSProperties = {
            position: 'absolute', left: 0, top: 0,
            transform: `scale(${scale},${scale})translate(${originX}px,${originY}px)`,
        };
        return <div className={`${CLASS_NAME}`}>
            <TransformedSvgCanvas paperTransform={paperTransform} style={{overflow: 'visible', pointerEvents: 'none'}}>
                {this.renderLinkStateHighlighting()}
                {this.renderElementOutlines()}
            </TransformedSvgCanvas>
            <div className={`${CLASS_NAME}__validation-layer`} style={htmlTransformStyle}>
                {this.renderElementStates()}
                {this.renderLinkStateLabels()}
            </div>
        </div>;
    }
}
