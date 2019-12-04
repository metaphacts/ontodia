import * as React from 'react';

import { LinkModel } from '../data/model';

import { Vector, computePolyline, getPointAlongPolyline, computePolylineLength } from '../diagram/geometry';
import { TransformedSvgCanvas } from '../diagram/paper';
import { PaperWidgetProps } from '../diagram/paperArea';
import { DiagramView, RenderingLayer } from '../diagram/view';
import { Link } from '../diagram/elements';

import { Debouncer } from '../viewUtils/async';
import { EventObserver } from '../viewUtils/events';
import { HtmlSpinner } from '../viewUtils/spinner';

import { EditorController } from './editorController';

import { AuthoringKind, AuthoringState } from './authoringState';
import { LinkValidation, ElementValidation } from './validation';

export interface Props extends PaperWidgetProps {
    view: DiagramView;
    editor: EditorController;
}

const CLASS_NAME = `ontodia-authoring-state`;
const LINK_LABEL_MARGIN = 5;

export class LinkStateWidget extends React.Component<Props, {}> {
    private readonly listener = new EventObserver();
    private readonly delayedUpdate = new Debouncer();

    componentDidMount() {
        this.listenEvents();
    }

    componentDidUpdate(prevProps: Props) {
        const sameEventSources = (
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
            const state = editor.authoringState.links.get(link.data);
            if (state) {
                const onCancel = () => editor.discardChange(state);

                let statusText: string;
                let title: string;

                if (state.deleted) {
                    statusText = 'Delete';
                    title = 'Revert deletion of the link';
                } else if (!state.before) {
                    statusText = 'New';
                    title = 'Revert creation of the link';
                } else {
                    statusText = 'Change';
                    title = 'Revert all changes in properties of the link';
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
            const event = editor.authoringState.links.get(link.data);
            const isDeletedLink = AuthoringState.isDeletedLink(editor.authoringState, link.data);
            const isUncertainLink = AuthoringState.isUncertainLink(editor.authoringState, link.data);
            if (event || isDeletedLink || isUncertainLink) {
                const path = this.calculateLinkPath(link);
                let color: string;
                if (isDeletedLink) {
                    color = 'red';
                } else if (isUncertainLink) {
                    color = 'blue';
                } else if (event && event.type === AuthoringKind.ChangeLink) {
                    color = event.before ? 'blue' : 'green';
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
            return {x, y: y - LINK_LABEL_MARGIN / 2};
        } else {
            const polyline = this.calculatePolyline(link);
            const polylineLength = computePolylineLength(polyline);
            return getPointAlongPolyline(polyline, polylineLength / 2);
        }
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
            </TransformedSvgCanvas>
            <div className={`${CLASS_NAME}__validation-layer`} style={htmlTransformStyle}>
                {this.renderLinkStateLabels()}
            </div>
        </div>;
    }
}
