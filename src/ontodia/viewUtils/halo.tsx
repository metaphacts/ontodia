import * as Backbone from 'backbone';
import * as joint from 'jointjs';
import * as React from 'react';

import { Element as DiagramElement } from '../diagram/elements';
import { boundsOf } from '../diagram/geometry';
import { PaperWidgetProps } from '../diagram/paperArea';
import { DiagramView } from '../diagram/view';

export interface Props extends PaperWidgetProps {
    target: DiagramElement | undefined;
    diagramView: DiagramView;
    onDelete?: () => void;
    onExpand?: () => void;
    navigationMenuOpened?: boolean;
    onToggleNavigationMenu?: () => void;
    onAddToFilter?: () => void;
}

const CLASS_NAME = 'ontodia-halo';

export class Halo extends React.Component<Props, void> {
    private handler = new Backbone.Model();

    componentDidMount() {
        this.listenToElement(this.props.target);
    }

    componentWillReceiveProps(nextProps: Props) {
        if (nextProps.target !== this.props.target) {
            if (this.props.target) { this.handler.stopListening(this.props.target); }
            this.listenToElement(nextProps.target);
        }
    }

    listenToElement(element: DiagramElement | undefined) {
        if (element) {
            this.handler.listenTo(element,
                'change:isExpanded change:position change:size', () => this.forceUpdate());
        }
    }

    componentWillUnmount() {
        this.props.diagramView.hideNavigationMenu();
        this.handler.stopListening();
    }

    render() {
        if (!this.props.target) {
            return <div className={CLASS_NAME} style={{display: 'none'}} />;
        }

        const {paperArea, target, navigationMenuOpened} = this.props;
        const cellExpanded = target.isExpanded;

        const bbox = boundsOf(target);
        const {x: x0, y: y0} = paperArea.paperToScrollablePaneCoords(bbox.x, bbox.y);
        const {x: x1, y: y1} = paperArea.paperToScrollablePaneCoords(
            bbox.x + bbox.width,
            bbox.y + bbox.height,
        );
        const style: React.CSSProperties = {left: x0, top: y0, width: x1 - x0, height: y1 - y0};

        return (
            <div className={CLASS_NAME} style={style}>
                <div className={`${CLASS_NAME}__delete`}
                    title='Remove an element from the diagram'
                    onClick={this.props.onDelete} />

                <div className={`${CLASS_NAME}__navigate ` +
                    `${CLASS_NAME}__navigate--${navigationMenuOpened ? 'closed' : 'open'}`}
                    title='Open a dialog to navigate to connected elements'
                    onClick={this.props.onToggleNavigationMenu} />

                <div className={`${CLASS_NAME}__add-to-filter`}
                    title='Search for connected elements'
                    onClick={this.props.onAddToFilter} />

                <div className={`${CLASS_NAME}__expand ` +
                    `${CLASS_NAME}__expand--${cellExpanded ? 'closed' : 'open'}`}
                    title={`Expand an element to reveal additional properties`}
                    onClick={this.props.onExpand} />
            </div>
        );
    }
}
