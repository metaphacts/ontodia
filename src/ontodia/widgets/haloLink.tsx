import * as React from 'react';

import { MetadataApi } from '../data/metadataApi';

import { Element, Link } from '../diagram/elements';
import { computePolyline, computePolylineLength, getPointAlongPolyline, Vector } from '../diagram/geometry';
import { PaperWidgetProps } from '../diagram/paperArea';
import { DiagramView } from '../diagram/view';

import { EditorController } from '../editor/editorController';
import { AuthoringState, AuthoringKind } from '../editor/authoringState';

import { EventObserver, Unsubscribe } from '../viewUtils/events';
import { Cancellation, Debouncer } from '../viewUtils/async';
import { HtmlSpinner } from '../viewUtils/spinner';

const CLASS_NAME = 'ontodia-halo-link';
const BUTTON_SIZE = 20;
const BUTTON_MARGIN = 5;

export interface Props extends PaperWidgetProps {
    view: DiagramView;
    editor: EditorController;
    metadataApi?: MetadataApi;
    target: Link;
    onEdit: () => void;
    onDelete: () => void;
    onRevert: () => void;
    onSourceMove: (point: { x: number; y: number }) => void;
    onTargetMove: (point: { x: number; y: number }) => void;
}

export interface State {
    canDelete?: boolean;
    canEdit?: boolean;
}

export class HaloLink extends React.Component<Props, State> {
    private readonly listener = new EventObserver();
    private targetListener = new EventObserver();
    private queryDebouncer = new Debouncer();
    private queryCancellation = new Cancellation();

    constructor(props: Props) {
        super(props);
        this.state = {};
    }

    private updateAll = () => this.forceUpdate();

    componentDidMount() {
        const {target, editor} = this.props;
        this.listener.listen(editor.events, 'changeAuthoringState', () => {
            this.queryAllowedActions();
        });
        this.listenToTarget(target);
        this.queryAllowedActions();
    }

    componentDidUpdate(prevProps: Props) {
        if (prevProps.target !== this.props.target) {
            this.listenToTarget(this.props.target);
            this.queryAllowedActions();
        }
    }

    componentWillUnmount() {
        this.listener.stopListening();
        this.listenToTarget(undefined);
        this.queryDebouncer.dispose();
        this.queryCancellation.abort();
    }

    private queryAllowedActions() {
        this.queryDebouncer.call(() => {
            this.queryCancellation.abort();
            this.queryCancellation = new Cancellation();
            this.queryCanDelete(this.props.target);
            this.queryCanEdit(this.props.target);
        });
    }

    private queryCanDelete(link: Link) {
        const {metadataApi, editor, view} = this.props;
        if (!metadataApi) {
            this.setState({canDelete: false});
            return;
        }
        if (isSourceOrTargetDeleted(editor.authoringState, link)) {
            this.setState({canDelete: false});
        } else {
            this.setState({canDelete: undefined});
            const source = view.model.getElement(link.sourceId);
            const target = view.model.getElement(link.targetId);
            const signal = this.queryCancellation.signal;
            metadataApi.canDeleteLink(link.data, source.data, target.data, signal).then(canDelete => {
                if (signal.aborted) { return; }
                if (this.props.target.id === link.id) {
                    this.setState({canDelete});
                }
            });
        }
    }

    private queryCanEdit(link: Link) {
        const {metadataApi, editor, view} = this.props;
        if (!metadataApi) {
            this.setState({canEdit: false});
            return;
        }
        if (isDeletedLink(editor.authoringState, link)) {
            this.setState({canEdit: false});
        } else {
            this.setState({canEdit: undefined});
            const source = view.model.getElement(link.sourceId);
            const target = view.model.getElement(link.targetId);
            const signal = this.queryCancellation.signal;
            metadataApi.canEditLink(link.data, source.data, target.data, signal).then(canEdit => {
                if (signal.aborted) { return; }
                if (this.props.target.id === link.id) {
                    this.setState({canEdit});
                }
            });
        }
    }

    private listenToTarget(link: Link | undefined) {
        const {view} = this.props;

        this.targetListener.stopListening();
        if (link) {
            const source = view.model.getElement(link.sourceId);
            const target = view.model.getElement(link.targetId);

            const listenToElement = (element: Element) => {
                this.targetListener.listen(element.events, 'changePosition', this.updateAll);
                this.targetListener.listen(element.events, 'changeSize', this.updateAll);
            };

            listenToElement(source);
            listenToElement(target);
            this.targetListener.listen(link.events, 'changeVertices', this.updateAll);
        }
    }

    private paperToScrollablePaneCoords(point: Vector): Vector {
        return this.props.paperArea.paperToScrollablePaneCoords(point.x, point.y);
    }

    private computePolyline(): ReadonlyArray<Vector> {
        const {view, target} = this.props;

        const sourceElement = view.model.getElement(target.sourceId);
        const targetElement = view.model.getElement(target.targetId);

        if (!(sourceElement && targetElement)) {
            return undefined;
        }

        const route = view.getRouting(target.id);
        const verticesDefinedByUser = target.vertices || [];
        const vertices = route ? route.vertices : verticesDefinedByUser;

        return computePolyline(sourceElement, targetElement, vertices);
    }

    private calculateDegree(source: Vector, target: Vector): number {
        const x = target.x - source.x;
        const y = target.y - source.y;
        const r = Math.sqrt(x * x + y * y);
        const unit = {x: x / r, y: y / r};
        return Math.atan2(unit.y, unit.x) * (180 / Math.PI);
    }

    private onSourceMove = (e: React.MouseEvent<HTMLElement>) => {
        const point = this.props.paperArea.pageToPaperCoords(e.pageX, e.pageY);
        this.props.onSourceMove(point);
    }

    private renderSourceButton(polyline: ReadonlyArray<Vector>) {
        const {editor, target} = this.props;
        const point = getPointAlongPolyline(polyline, 0);
        const {x, y} = this.paperToScrollablePaneCoords(point);

        const style = {top: y - BUTTON_SIZE / 2, left: x - BUTTON_SIZE / 2};

        return (
            <button className={`${CLASS_NAME}__button`} style={style}
                disabled={isDeletedLink(editor.authoringState, target)}
                onMouseDown={this.onSourceMove}>
                <svg width={BUTTON_SIZE} height={BUTTON_SIZE}>
                    <g transform={`scale(${BUTTON_SIZE})`}>
                        <circle r={0.5} cx={0.5} cy={0.5} fill='#198AD3' />
                    </g>
                </svg>
            </button>
        );
    }

    private onTargetMove = (e: React.MouseEvent<HTMLElement>) => {
        const point = this.props.paperArea.pageToPaperCoords(e.pageX, e.pageY);
        this.props.onTargetMove(point);
    }

    private getButtonPosition(polyline: ReadonlyArray<Vector>, index: number): { top: number; left: number } {
        const polylineLength = computePolylineLength(polyline);
        const point = getPointAlongPolyline(polyline, polylineLength - (BUTTON_SIZE + BUTTON_MARGIN) * index);
        const {x, y} = this.paperToScrollablePaneCoords(point);

        return {top: y - BUTTON_SIZE / 2, left: x - BUTTON_SIZE / 2};
    }

    private renderTargetButton(polyline: ReadonlyArray<Vector>) {
        const {editor, target} = this.props;
        const style = this.getButtonPosition(polyline, 0);

        const {length} = polyline;
        const degree = this.calculateDegree(polyline[length - 1], polyline[length - 2]);

        return (
            <button className={`${CLASS_NAME}__button`} style={style}
                disabled={isDeletedLink(editor.authoringState, target)}
                onMouseDown={this.onTargetMove}>
                <svg width={BUTTON_SIZE} height={BUTTON_SIZE} style={{transform: `rotate(${degree}deg)`}}>
                    <g transform={`scale(${BUTTON_SIZE})`}>
                        <polygon points={'0,0.5 1,1 1,0'} fill='#198AD3' />
                    </g>
                </svg>
            </button>
        );
    }

    private renderEditButton(polyline: ReadonlyArray<Vector>) {
        const {canEdit} = this.state;
        const style = this.getButtonPosition(polyline, 1);
        if (canEdit === undefined) {
            return (
                <div className={`${CLASS_NAME}__spinner`} style={style}>
                    <HtmlSpinner width={20} height={20} />
                </div>
            );
        }
        const title = canEdit ? 'Edit link' : 'Editing is unavailable for the selected link';
        return (
            <button className={`${CLASS_NAME}__button ${CLASS_NAME}__edit`} style={style} title={title}
                onClick={this.props.onEdit} disabled={!canEdit} />
        );
    }

    private renderDeleteButton(polyline: ReadonlyArray<Vector>) {
        const {canDelete} = this.state;
        const style = this.getButtonPosition(polyline, 2);
        if (canDelete === undefined) {
            return (
                <div className={`${CLASS_NAME}__spinner`} style={style}>
                    <HtmlSpinner width={20} height={20} />
                </div>
            );
        }
        const title = canDelete ? 'Delete link' : 'Deletion is unavailable for the selected link';
        return (
            <button className={`${CLASS_NAME}__button ${CLASS_NAME}__delete`} style={style} title={title}
                onClick={this.props.onDelete} disabled={!canDelete} />
        );
    }

    private renderRevertButton(polyline: ReadonlyArray<Vector>) {
        const style = this.getButtonPosition(polyline, 2);
        return (
            <button className={`${CLASS_NAME}__button ${CLASS_NAME}__revert`}
                style={style}
                title={`Revert deletion of the selected link`}
                onClick={this.props.onRevert} />
        );
    }

    render() {
        const {editor, target} = this.props;
        const polyline = this.computePolyline();
        if (!polyline) { return null; }

        const deleteOrRevertButton = (
            isDeletedByItself(editor.authoringState, target) ? this.renderRevertButton(polyline) :
            isSourceOrTargetDeleted(editor.authoringState, target) ? null :
            this.renderDeleteButton(polyline)
        );

        return (
            <div className={`${CLASS_NAME}`}>
                {this.renderTargetButton(polyline)}
                {this.renderSourceButton(polyline)}
                {isDeletedLink(editor.authoringState, target)
                    ? null : this.renderEditButton(polyline)}
                {deleteOrRevertButton}
            </div>
        );
    }
}

function isDeletedLink(state: AuthoringState, link: Link) {
    return isDeletedByItself(state, link) || isSourceOrTargetDeleted(state, link);
}

function isDeletedByItself(state: AuthoringState, link: Link) {
    const event = state.index.links.get(link.data);
    return event && event.type === AuthoringKind.DeleteLink;
}

function isSourceOrTargetDeleted(state: AuthoringState, link: Link) {
    const sourceEvent = state.index.elements.get(link.data.sourceId);
    const targetEvent = state.index.elements.get(link.data.targetId);
    return (
        (sourceEvent && sourceEvent.type === AuthoringKind.DeleteElement) ||
        (targetEvent && targetEvent.type === AuthoringKind.DeleteElement)
    );
}
