import * as React from 'react';

import { DiagramView } from '../diagram/view';
import { PaperWidgetProps } from '../diagram/paperArea';
import { Element, Link } from '../diagram/elements';
import { EventObserver, Unsubscribe } from '../viewUtils/events';
import { Cancellation } from '../viewUtils/async';
import { renderSpinnerInRect } from '../viewUtils/spinner';
import { computePolyline, computePolylineLength, getPointAlongPolyline, Vector } from '../diagram/geometry';
import { MetadataApi } from '../data/metadataApi';

const CLASS_NAME = 'ontodia-halo-link';
const BUTTON_SIZE = 20;
const BUTTON_MARGIN = 5;

export interface Props extends PaperWidgetProps {
    view: DiagramView;
    metadataApi?: MetadataApi;
    target: Link;
    onEdit: () => void;
    onRemove: () => void;
    onSourceMove: (point: { x: number; y: number }) => void;
    onTargetMove: (point: { x: number; y: number }) => void;
}

export interface State {
    canDelete?: boolean;
}

export class HaloLink extends React.Component<Props, State> {
    private unsubscribeFromTarget: Unsubscribe | undefined = undefined;
    private readonly handler = new EventObserver();
    private readonly cancellation = new Cancellation();

    constructor(props: Props) {
        super(props);
        this.state = {};
    }

    private updateAll = () => this.forceUpdate();

    componentDidMount() {
        this.listenToTarget(this.props.target);
        this.canDelete(this.props.target);
    }

    componentWillReceiveProps(nextProps: Props) {
        if (nextProps.target !== this.props.target) {
            this.listenToTarget(nextProps.target);
        }
    }

    componentDidUpdate(prevProps: Props) {
        if (prevProps.target !== this.props.target) {
            this.canDelete(this.props.target);
        }
    }

    componentWillUnmount() {
        this.listenToTarget(undefined);
        this.cancellation.abort();
    }

    private canDelete(link: Link) {
        const {metadataApi, view} = this.props;
        if (!metadataApi) {
            this.setState({canDelete: false});
        } else {
            this.setState({canDelete: undefined});
            const source = view.model.getElement(link.sourceId);
            const target = view.model.getElement(link.targetId);
            metadataApi.canDeleteLink(link.data, source.data, target.data, this.cancellation.signal).then(canDelete => {
                if (!this.cancellation.signal.aborted && this.props.target.id === link.id) {
                    this.setState({canDelete});
                }
            });
        }
    }

    private listenToTarget(link: Link | undefined) {
        if (this.unsubscribeFromTarget) {
            this.unsubscribeFromTarget();
            this.unsubscribeFromTarget = undefined;
        }

        if (link) {
            const {view} = this.props;

            const source = view.model.getElement(link.sourceId);
            const target = view.model.getElement(link.targetId);

            this.listenToElement(source);
            this.listenToElement(target);

            this.handler.listen(link.events, 'changeVertices', this.updateAll);

            this.unsubscribeFromTarget = () => { this.handler.stopListening(); };
        }
    }

    private listenToElement(element: Element) {
        this.handler.listen(element.events, 'changePosition', this.updateAll);
        this.handler.listen(element.events, 'changeSize', this.updateAll);
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
        const point = getPointAlongPolyline(polyline, 0);
        const {x, y} = this.paperToScrollablePaneCoords(point);

        const style = {top: y - BUTTON_SIZE / 2, left: x - BUTTON_SIZE / 2};

        return (
            <div className={`${CLASS_NAME}__button`} style={style} onMouseDown={this.onSourceMove}>
                <svg width={BUTTON_SIZE} height={BUTTON_SIZE}>
                    <g transform={`scale(${BUTTON_SIZE})`}>
                        <circle r={0.5} cx={0.5} cy={0.5} fill='#198AD3' />
                    </g>
                </svg>
            </div>
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
        const style = this.getButtonPosition(polyline, 0);

        const {length} = polyline;
        const degree = this.calculateDegree(polyline[length - 1], polyline[length - 2]);

        return (
            <div className={`${CLASS_NAME}__button`} style={style} onMouseDown={this.onTargetMove}>
                <svg width={BUTTON_SIZE} height={BUTTON_SIZE} style={{transform: `rotate(${degree}deg)`}}>
                    <g transform={`scale(${BUTTON_SIZE})`}>
                        <polygon points={'0,0.5 1,1 1,0'} fill='#198AD3' />
                    </g>
                </svg>
            </div>
        );
    }

    private renderEditButton(polyline: ReadonlyArray<Vector>) {
        const style = this.getButtonPosition(polyline, 1);
        return (
            <div className={`${CLASS_NAME}__button ${CLASS_NAME}__edit`} style={style} onClick={this.props.onEdit} />
        );
    }

    private renderDeleteButton(polyline: ReadonlyArray<Vector>) {
        const {canDelete} = this.state;
        const style = this.getButtonPosition(polyline, 2);
        if (canDelete === undefined) {
            return <div style={{...style, position: 'absolute'}}>{renderSpinnerInRect({width: 20, height: 20})}</div>;
        }
        const title = canDelete ? 'Delete link' : 'Deletion is unavailable for the selected link';
        return (
            <button className={`${CLASS_NAME}__button ${CLASS_NAME}__delete`} style={style} title={title}
                onClick={this.props.onRemove} disabled={!canDelete} />
        );
    }

    render() {
        const polyline = this.computePolyline();

        if (!polyline) { return null; }

        return (
            <div className={`${CLASS_NAME}`}>
                {this.renderTargetButton(polyline)}
                {this.renderSourceButton(polyline)}
                {this.renderEditButton(polyline)}
                {this.renderDeleteButton(polyline)}
            </div>
        );
    }
}
