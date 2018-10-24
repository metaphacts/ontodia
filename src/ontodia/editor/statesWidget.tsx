import * as React from 'react';

import { boundsOf, computePolyline, Vector, getPointAlongPolyline, Rect } from '../diagram/geometry';
import { TransformedSvgCanvas } from '../diagram/paper';
import { PaperWidgetProps } from '../diagram/paperArea';
import { DiagramView, RenderingLayer } from '../diagram/view';
import { Link, Element } from '../diagram/elements';

import { Debouncer } from '../viewUtils/async';
import { EventObserver } from '../viewUtils/events';

import { AuthoringKind } from './authoringState';
import { EditorController } from './editorController';
import { HtmlSpinner } from '../viewUtils/spinner';
import { ElementIri } from '../data/model';
import { formatLocalizedLabel } from '../diagram/model';

export interface Props extends PaperWidgetProps {
    editor: EditorController;
    view: DiagramView;
}

const CLASS_NAME = `ontodia-states-widget`;
const WARNING_SIZE = 20;
const WARNING_MARGIN = 5;

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
            if (data.changeVertices) {
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

    private renderLinksStates() {
        const {editor} = this.props;
        return editor.model.links.map(link => {
            if (editor.temporaryState.links.has(link.data)) {
                const path = this.calculateLinkPath(link);
                return (
                    <path key={link.id} d={path} fill={'none'} stroke={'grey'} strokeWidth={5} strokeOpacity={0.5}
                        strokeDasharray={'8 8'}/>
                );
            }
            const state = (
                editor.authoringState.index.links.get(link.data) ||
                editor.authoringState.index.elements.get(link.data.sourceId) ||
                editor.authoringState.index.elements.get(link.data.targetId)
            );
            if (state) {
                const path = this.calculateLinkPath(link);
                let color: string;
                if (state.type === AuthoringKind.ChangeLink) {
                    color = state.before ? 'blue' : 'green';
                } else if (state.type === AuthoringKind.DeleteLink || state.type === AuthoringKind.DeleteElement) {
                    color = 'red';
                }
                return (
                    <path key={link.id} d={path} fill={'none'} stroke={color} strokeWidth={5} strokeOpacity={0.5} />
                );
            }
            return null;
        });
    }

    private renderLinksValidationState() {
        const {editor} = this.props;
        const {validationState} = editor;

        return editor.model.links.map(link => {
            const validation = validationState.links.get(link.data);
            if (!validation) {
                return null;
            }
            const polyline = this.calculatePolyline(link);
            const style = this.getWarningPosition(polyline);
            const title = validation.errors.map(error => error.message).join('\n');

            return (<div
                className={`${CLASS_NAME}_warning`}
                key={link.id}
                style={style}
                title={title}>
                {validation.loading ?
                    <HtmlSpinner width={20} height={20}/>
                    : <div className={`${CLASS_NAME}_warning__invalid-icon`}/>
                }
                {(!validation.loading && validation.errors.length > 0)
                    ? validation.errors.length : undefined}
            </div>);
        });
    }

    private getWarningPosition(polyline: ReadonlyArray<Vector>): { top: number; left: number } {
        const point = getPointAlongPolyline(polyline, WARNING_SIZE + WARNING_MARGIN);
        const {x, y} = this.props.paperArea.paperToScrollablePaneCoords(point.x, point.y);

        return {top: y - WARNING_SIZE / 2, left: x - WARNING_SIZE / 2};
    }

    private scrollBoundsOf(element: Element): Rect {
        const {paperArea} = this.props;
        const bbox = boundsOf(element);
        const {x: x0, y: y0} = paperArea.paperToScrollablePaneCoords(bbox.x, bbox.y);
        const {x: x1, y: y1} = paperArea.paperToScrollablePaneCoords(
            bbox.x + bbox.width,
            bbox.y + bbox.height,
        );
        return {
            x: x0,
            y: y0,
            width: x1 - x0,
            height: y1 - y0,
        };
    }

    private renderElementsStates() {
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

    private renderElementsStatesLabels() {
        const {editor} = this.props;
        return editor.model.elements.map(element => {
            const {x, y} = this.scrollBoundsOf(element);
            const state = editor.authoringState.index.elements.get(element.iri);
            const validationState = this.renderElementValidationStatus(element.iri);

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
                } else {
                    throw new Error('Unexpected element status');
                }

                return <div
                    key={element.id}
                    className={`${CLASS_NAME}-state-label`}
                    style={{left: x, top: y}}>
                    <div className={`${CLASS_NAME}-state-label_body-container`}>
                        <div className={`${CLASS_NAME}-state-label_body-container__body`}>
                            <span className={`${CLASS_NAME}__action`}>{statusText}</span>[
                                <span
                                    className={`${CLASS_NAME}__cancel`}
                                    onClick={onCancel}
                                    title={title}>
                                    cancel
                                </span>
                            ]
                            {validationState}
                        </div>
                    </div>
                </div>;
            } else if (validationState) {
                return <div
                    key={element.id}
                    className={`${CLASS_NAME}-state-label`}
                    style={{left: x, top: y}}>
                    <div className={`${CLASS_NAME}-state-label_body-container`}>
                        <div className={`${CLASS_NAME}-state-label_body-container__body`}>
                            {validationState}
                        </div>
                    </div>
                </div>;
            }
            return null;
        });
    }

    private renderElementValidationStatus(elementIri: ElementIri) {
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
        return (
            <div className={`${CLASS_NAME}__validation`} title={title}>
                {validation.loading
                    ? <HtmlSpinner width={15} height={17} />
                    : <div className={`${CLASS_NAME}__invalid-icon`} />}
                {(!validation.loading && validation.errors.length > 0)
                    ? validation.errors.length : undefined}
            </div>
        );
    }

    render() {
        const {editor, paperTransform} = this.props;
        if (!editor.inAuthoringMode) {
            return null;
        }
        return (<div className={`${CLASS_NAME}`}>
            <TransformedSvgCanvas paperTransform={paperTransform} style={{overflow: 'visible', pointerEvents: 'none'}}>
                {this.renderLinksStates()}
                {this.renderElementsStates()}
            </TransformedSvgCanvas>
            <div className={`${CLASS_NAME}__validation-layer`}>
                {this.renderElementsStatesLabels()}
                {this.renderLinksValidationState()}
            </div>
        </div>);
    }
}
