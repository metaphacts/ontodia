import * as React from 'react';

import { DiagramView } from '../diagram/view';
import { Element, Link } from '../diagram/elements';
import { EventObserver, Unsubscribe } from '../viewUtils/events';
import { PaperWidgetProps } from '../diagram/paperArea';
import { boundsOf, computePolyline, computePolylineLength, getPointAlongPolyline } from '../diagram/geometry';

const WIDTH = 300;
const HEIGHT = 300;
const ELEMENT_OFFSET = 40;
const LINK_OFFSET = 20;

interface Position {
    top: number;
    left: number;
}

export interface Props extends PaperWidgetProps {
    view: DiagramView;
    target: Element | Link;
}

export class Dialog extends React.Component<Props, {}> {
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
    }

    private calculatePositionForElement(element: Element): Position {
        const {paperArea} = this.props;

        const bbox = boundsOf(element);
        const {y: y0} = paperArea.paperToScrollablePaneCoords(bbox.x, bbox.y);
        const {x: x1, y: y1} = paperArea.paperToScrollablePaneCoords(
            bbox.x + bbox.width,
            bbox.y + bbox.height,
        );

        return {
            top: (y0 + y1) / 2 - (HEIGHT / 2),
            left: x1 + ELEMENT_OFFSET,
        };
    }

    private calculatePositionForLink(link: Link): Position {
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
        const targetPoint = getPointAlongPolyline(polyline, polylineLength);

        const {x, y} = paperArea.paperToScrollablePaneCoords(targetPoint.x, targetPoint.y);

        return {top: y + LINK_OFFSET, left: x + LINK_OFFSET};
    }

    private calculatePosition(): Position {
        const {target} = this.props;

        if (target instanceof Element) {
            return this.calculatePositionForElement(target);
        } else if (target instanceof Link) {
            return this.calculatePositionForLink(target);
        }

        throw new Error('Unknown target type');
    }

    render() {
        const {top, left} = this.calculatePosition();

        return (
            <div className='ontodia-dialog' style={{top, left, height: HEIGHT, width: WIDTH}}>
                {this.props.children}
            </div>
        );
    }
}
