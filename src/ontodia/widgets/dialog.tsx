import * as React from 'react';

import { DiagramView } from '../diagram/view';
import { Element, Link } from '../diagram/elements';
import { EventObserver, Unsubscribe } from '../viewUtils/events';
import { PaperWidgetProps } from '../diagram/paperArea';
import {
    boundsOf,
    computePolyline,
    computePolylineLength,
    getPointAlongPolyline,
    Vector,
} from '../diagram/geometry';
import { DraggableHandle } from '../workspace/draggableHandle';

const DEFAULT_WIDTH = 300;
const DEFAULT_HEIGHT = 300;
const MIN_WIDTH = 250;
const MIN_HEIGHT = 250;
const MAX_WIDTH = 800;
const MAX_HEIGHT = 800;

const ELEMENT_OFFSET = 40;
const LINK_OFFSET = 20;
const FOCUS_OFFSET = 20;

const CLASS_NAME = 'ontodia-dialog';

export interface Props extends PaperWidgetProps {
    view: DiagramView;
    target: Element | Link;
    size?: { width: number; height: number };
    caption?: string;
    offset?: Vector;
    calculatePosition?: () => Vector;
    onClose: () => void;
}

export interface State {
    width?: number;
    height?: number;
}

export class Dialog extends React.Component<Props, State> {
    private static defaultProps: Partial<Props> = {
        size: {width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT},
    };

    private unsubscribeFromTarget: Unsubscribe | undefined = undefined;
    private readonly handler = new EventObserver();

    private updateAll = () => this.forceUpdate();

    constructor(props: Props) {
        super(props);
        this.state = {};
    }

    componentDidMount() {
        this.listenToTarget(this.props.target);
        this.focusOn();
    }

    componentWillReceiveProps(nextProps: Props) {
        if (nextProps.target !== this.props.target) {
            this.listenToTarget(nextProps.target);
        }
    }

    componentWillUnmount() {
        this.listenToTarget(undefined);
    }

    private listenToTarget(target?: Element | Link) {
        if (this.unsubscribeFromTarget) {
            this.unsubscribeFromTarget();
            this.unsubscribeFromTarget = undefined;
        }

        if (target) {
            const {view} = this.props;

            if (target instanceof Element) {
                this.listenToElement(target);
            } else if (target instanceof Link) {
                this.listenToLink(target);
            }

            this.handler.listen(view.events, 'changeLanguage', this.updateAll);

            this.unsubscribeFromTarget = () => { this.handler.stopListening(); };
        }
    }

    private listenToElement(element: Element) {
        this.handler.listen(element.events, 'changePosition', this.updateAll);
        this.handler.listen(element.events, 'changeSize', this.updateAll);
    }

    private listenToLink(link: Link) {
        const {view} = this.props;

        const source = view.model.getElement(link.sourceId);
        const target = view.model.getElement(link.targetId);

        this.listenToElement(source);
        this.listenToElement(target);

        this.handler.listen(link.events, 'changeVertices', this.updateAll);
        this.handler.listen(link.events, 'changeLabelBounds', this.updateAll);
    }

    private calculatePositionForElement(element: Element): Vector {
        const {paperArea, size} = this.props;

        const bbox = boundsOf(element);
        const {y: y0} = paperArea.paperToScrollablePaneCoords(bbox.x, bbox.y);
        const {x: x1, y: y1} = paperArea.paperToScrollablePaneCoords(
            bbox.x + bbox.width,
            bbox.y + bbox.height,
        );

        return {
            x: x1 + ELEMENT_OFFSET,
            y: (y0 + y1) / 2 - (size.height / 2),
        };
    }

    private calculatePositionForLink(link: Link): Vector {
        const {view, paperArea} = this.props;

        const source = view.model.getElement(link.sourceId);
        const target = view.model.getElement(link.targetId);

        if (!source || !target) {
            throw new Error('Source and target are not specified');
        }

        const route = view.getRouting(link.id);
        const verticesDefinedByUser = link.vertices || [];
        const vertices = route ? route.vertices : verticesDefinedByUser;

        const polyline = computePolyline(source, target, vertices);
        const polylineLength = computePolylineLength(polyline);
        const targetPoint = getPointAlongPolyline(polyline, polylineLength / 2);

        const {x, y} = paperArea.paperToScrollablePaneCoords(targetPoint.x, targetPoint.y);

        return {y: y + LINK_OFFSET, x: x + LINK_OFFSET};
    }

    private calculatePosition(): Vector {
        const {target, paperArea, offset = {x: 0, y: 0}, calculatePosition} = this.props;

        if (calculatePosition) {
            const pos = calculatePosition();
            const {x, y} = paperArea.paperToScrollablePaneCoords(pos.x, pos.y);
            return {x: x + offset.x, y: y + offset.y};
        }

        if (target instanceof Element) {
            return this.calculatePositionForElement(target);
        } else if (target instanceof Link) {
            return this.calculatePositionForLink(target);
        }

        throw new Error('Unknown target type');
    }

    private getViewPortScrollablePoints(): {min: Vector; max: Vector} {
        const {paperArea} = this.props;
        const paperAreaMetrix = paperArea.getAreaMetrics();
        const min = paperArea.clientToScrollablePaneCoords(0, 0);
        const max = paperArea.clientToScrollablePaneCoords(
            paperAreaMetrix.clientWidth, paperAreaMetrix.clientHeight
        );
        return {min, max};
    }

    private getDialogScrollablePoints(): {min: Vector; max: Vector} {
        const {size} = this.props;
        const {x, y} = this.calculatePosition();
        const min = {
            x: x - FOCUS_OFFSET,
            y: y - FOCUS_OFFSET,
        };
        const max = {
            x: min.x + size.width + FOCUS_OFFSET * 2,
            y: min.y + size.height + FOCUS_OFFSET * 2,
        };
        return {min, max};
    }

    private focusOn() {
        const {paperArea} = this.props;
        const {min: viewPortMin, max: viewPortMax} = this.getViewPortScrollablePoints();
        const {min, max} = this.getDialogScrollablePoints();

        let xOffset = 0;
        if (min.x < viewPortMin.x) {
            xOffset = min.x - viewPortMin.x;
        } else if (max.x > viewPortMax.x) {
            xOffset = max.x - viewPortMax.x;
        }

        let yOffset = 0;
        if (min.y < viewPortMin.y) {
            yOffset = min.y - viewPortMin.y;
        } else if (max.y > viewPortMax.y) {
            yOffset = max.y - viewPortMax.y;
        }

        const curScrollableCenter = {
            x: viewPortMin.x + (viewPortMax.x - viewPortMin.x) / 2,
            y: viewPortMin.y + (viewPortMax.y - viewPortMin.y) / 2,
        };
        const newScrollabalCenter = {
            x: curScrollableCenter.x + xOffset,
            y: curScrollableCenter.y + yOffset,
        };
        const paperCenter = paperArea.scrollablePaneToPaperCoords(
            newScrollabalCenter.x, newScrollabalCenter.y,
        );
        paperArea.centerTo(paperCenter);
    }

    private startSize: Vector;
    private onStartDragging = (e: React.MouseEvent<HTMLDivElement>) => {
        this.preventSelection();
        const {size} = this.props;
        this.startSize = {x: this.state.width || size.width, y: this.state.height || size.height};
    }

    private calculateHeight(height: number) {
        const {size} = this.props;
        const minHeight = Math.min(size.height, MIN_HEIGHT);
        const maxHeight = Math.max(size.height, MAX_HEIGHT);
        return Math.max(minHeight, Math.min(maxHeight, height));
    }

    private calculateWidth(width: number) {
        const {size} = this.props;
        const minWidth = Math.min(size.width, MIN_WIDTH);
        const maxWidth = Math.max(size.width, MAX_WIDTH);
        return Math.max(minWidth, Math.min(maxWidth, width));
    }

    private onDragHandleBottom = (e: MouseEvent, dx: number, dy: number) => {
        const height = this.calculateHeight(this.startSize.y + dy);
        this.setState({height});
    }

    private onDragHandleRight = (e: MouseEvent, dx: number) => {
        const width = this.calculateWidth(this.startSize.x + dx);
        this.setState({width});
    }

    private onDragHandleBottomRight = (e: MouseEvent, dx: number, dy: number) => {
        const width = this.calculateWidth(this.startSize.x + dx);
        const height = this.calculateHeight(this.startSize.y + dy);
        this.setState({width, height});
    }

    private preventSelection = () => {
        const onMouseUp = () => {
            document.body.classList.remove('ontodia--unselectable');
            document.removeEventListener('mouseup', onMouseUp);
        };
        document.addEventListener('mouseup', onMouseUp);
        document.body.classList.add('ontodia--unselectable');
    }

    render() {
        const {size, caption} = this.props;
        const {x, y} = this.calculatePosition();
        const width = this.state.width || size.width;
        const height = this.state.height || size.height;
        const style = {
            top: y,
            left: x,
            width,
            height,
        };

        return (
            <div className={CLASS_NAME} style={style}>
                <button className={`${CLASS_NAME}__close-button`} onClick={() => this.props.onClose()} />
                {caption ? <div className='ontodia-dialog__caption'>{caption}</div> : null}
                {this.props.children}
                <DraggableHandle
                    className={`${CLASS_NAME}__bottom-handle`}
                    onBeginDragHandle={this.onStartDragging}
                    onDragHandle={this.onDragHandleBottom}>
                </DraggableHandle>
                <DraggableHandle
                    className={`${CLASS_NAME}__right-handle`}
                    onBeginDragHandle={this.onStartDragging}
                    onDragHandle={this.onDragHandleRight}>
                </DraggableHandle>
                <DraggableHandle
                    className={`${CLASS_NAME}__bottom-right-handle`}
                    onBeginDragHandle={this.onStartDragging}
                    onDragHandle={this.onDragHandleBottomRight}>
                </DraggableHandle>
            </div>
        );
    }
}
