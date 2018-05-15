import * as React from 'react';

import { Element as DiagramElement, ElementEvents } from '../diagram/elements';
import { boundsOf } from '../diagram/geometry';
import { PaperWidgetProps } from '../diagram/paperArea';

import { EditorController } from '../editor/editorController';

import { AnyListener, Unsubscribe } from '../viewUtils/events';

export interface Props extends PaperWidgetProps {
    target: DiagramElement | undefined;
    editor: EditorController;
    onDelete?: () => void;
    onExpand?: () => void;
    navigationMenuOpened?: boolean;
    onToggleNavigationMenu?: () => void;
    onAddToFilter?: () => void;
    onEdit?: () => void;
    onEstablishNewLink?: (point: { x: number; y: number; }) => void;
}

const CLASS_NAME = 'ontodia-halo';

export class Halo extends React.Component<Props, {}> {
    private unsubscribeFromElement: Unsubscribe | undefined = undefined;

    componentDidMount() {
        this.listenToElement(this.props.target);
    }

    componentWillReceiveProps(nextProps: Props) {
        if (nextProps.target !== this.props.target) {
            this.listenToElement(nextProps.target);
        }
    }

    listenToElement(element: DiagramElement | undefined) {
        if (this.unsubscribeFromElement) {
            this.unsubscribeFromElement();
            this.unsubscribeFromElement = undefined;
        }
        if (element) {
            element.events.onAny(this.onElementEvent);
            this.unsubscribeFromElement = () => element.events.offAny(this.onElementEvent);
        }
    }

    private onElementEvent: AnyListener<ElementEvents> = data => {
        if (data.changePosition || data.changeSize || data.changeExpanded) {
            this.forceUpdate();
        }
    }

    componentWillUnmount() {
        this.listenToElement(undefined);
    }

    private onEstablishNewLink = (e: React.MouseEvent<HTMLElement>) => {
        const point = this.props.paperArea.pageToPaperCoords(e.pageX, e.pageY);
        this.props.onEstablishNewLink(point);
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
                    role='button'
                    title='Remove an element from the diagram'
                    onClick={this.props.onDelete} />

                <div className={`${CLASS_NAME}__navigate ` +
                    `${CLASS_NAME}__navigate--${navigationMenuOpened ? 'closed' : 'open'}`}
                    role='button'
                    title='Open a dialog to navigate to connected elements'
                    onClick={this.props.onToggleNavigationMenu} />

                <div className={`${CLASS_NAME}__add-to-filter`}
                    role='button'
                    title='Search for connected elements'
                    onClick={this.props.onAddToFilter} />

                <div className={`${CLASS_NAME}__expand ` +
                    `${CLASS_NAME}__expand--${cellExpanded ? 'closed' : 'open'}`}
                    role='button'
                    title={`Expand an element to reveal additional properties`}
                    onClick={this.props.onExpand} />
                <div className={`${CLASS_NAME}__edit`}
                     role='button'
                     title={`Edit entity`}
                     onClick={this.props.onEdit} />
                <div className={`${CLASS_NAME}__establish-connection`}
                     role='button'
                     title={`Establish connection`}
                     onMouseDown={this.onEstablishNewLink} />
            </div>
        );
    }
}
