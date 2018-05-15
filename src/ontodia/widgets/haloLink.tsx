import * as React from 'react';

import { DiagramView } from '../diagram/view';
import { PaperWidgetProps } from '../diagram/paperArea';
import { Element, Link } from '../diagram/elements';
import { EventObserver, Unsubscribe } from '../viewUtils/events';
import { computePolyline, computePolylineLength, getPointAlongPolyline, Vector } from '../diagram/geometry';

const CLASS_NAME = 'ontodia-halo-link';
const BUTTON_SIZE = 20;
const BUTTON_MARGIN = 5;

export interface Props extends PaperWidgetProps {
    view: DiagramView;
    target: Link;
    onEdit: () => void;
    onRemove: () => void;
    onSourceMove: (point: { x: number; y: number }) => void;
    onTargetMove: (point: { x: number; y: number }) => void;
}

export class HaloLink extends React.Component<Props, {}> {
    private unsubscribeFromTarget: Unsubscribe | undefined = undefined;
    private readonly handler = new EventObserver();

    private updateAll = () => this.forceUpdate();

    componentDidMount() {
        this.listenToTarget(this.props.target);
    }

    componentWillReceiveProps(nextProps: Props) {
        if (nextProps.target !== this.props.target) {
            this.listenToTarget(nextProps.target);
        }
    }

    componentWillUnmount() {
        this.listenToTarget(undefined);
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

    private renderRemoveButton(polyline: ReadonlyArray<Vector>) {
        const style = this.getButtonPosition(polyline, 2);
        return (
            <div className={`${CLASS_NAME}__button ${CLASS_NAME}__remove`} style={style}
                onClick={this.props.onRemove} />
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
                {this.renderRemoveButton(polyline)}
            </div>
        );
    }
}
