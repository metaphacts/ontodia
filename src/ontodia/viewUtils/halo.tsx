import * as Backbone from 'backbone';
import * as joint from 'jointjs';
import * as React from 'react';

import { DiagramView } from '../diagram/view';

export interface Props {
    paper: joint.dia.Paper;
    cellView: joint.dia.CellView;
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

    componentWillMount() {
        this.handler.listenTo(this.props.paper, 'resize scale', () => this.forceUpdate());
        this.listenToCell(this.props.cellView);
    }

    componentWillReceiveProps(nextProps: Props) {
        if (nextProps.cellView !== this.props.cellView) {
            if (this.props.cellView) { this.handler.stopListening(this.props.cellView.model); }
            this.listenToCell(nextProps.cellView);
        }
    }

    listenToCell(cellView: joint.dia.CellView) {
        if (cellView) {
            this.handler.listenTo(cellView.model,
                'change:isExpanded change:position change:size', () => this.forceUpdate());
        }
    }

    componentWillUnmount() {
        this.props.diagramView.hideNavigationMenu();
        this.handler.stopListening();
    }

    render() {
        if (!this.props.cellView) {
            return <div className={CLASS_NAME} style={{display: 'none'}} />;
        }

        const {cellView, navigationMenuOpened} = this.props;
        const cellExpanded = cellView.model.get('isExpanded');

        const bbox = this.props.cellView.getBBox();
        const style = {
            top: bbox.y,
            left: bbox.x,
            height: bbox.height,
            width: bbox.width,
        };

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
