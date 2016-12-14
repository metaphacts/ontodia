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
}

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
            return <div className='ontodia-halo' style={{display: 'none'}} />;
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
            <div className='ontodia-halo' style={style}>
                <div className='ontodia-halo__delete' onClick={this.props.onDelete} />

                <div className={'ontodia-halo__navigate ' +
                (navigationMenuOpened ? 'ontodia-halo__navigate--closed' : 'ontodia-halo__navigate--open')}
                    onClick={this.props.onToggleNavigationMenu} />

                <div className={'ontodia-halo__expand ' +
                (cellExpanded ? 'ontodia-halo__expand--closed' : 'ontodia-halo__expand--open')}
                     onClick={this.props.onExpand} />
            </div>
        );
    }
}
