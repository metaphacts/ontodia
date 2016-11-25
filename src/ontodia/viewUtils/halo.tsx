import * as Backbone from 'backbone';
import * as joint from 'jointjs';
import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { DiagramView } from '../diagram/view';

export interface HaloOptions {
    paper: joint.dia.Paper;
    cellView: joint.dia.CellView;
    diagramView: DiagramView;
    onDelete?: () => void;
    onExpand?: () => void;
    navigationMenuOpened?: boolean;
    onToggleNavigationMenu?: () => void;
}

export class Halo {
    private container: HTMLElement;
    private handler: Backbone.Model;

    constructor(public options: HaloOptions) {
        this.container = document.createElement('div');
        this.options.paper.el.appendChild(this.container);

        this.render();

        this.handler = new Backbone.Model();
        this.handler.listenTo(this.options.cellView.model,
            'change:isExpanded change:position change:size', this.render);
        this.handler.listenTo(this.options.paper, 'resize scale', this.render);
    }

    private render = () => {
        ReactDOM.render(React.createElement(HaloMarkup, {
            cellView: this.options.cellView,
            cellIsExpanded: this.options.cellView.model.get('isExpanded'),
            onDelete: this.options.onDelete,
            onExpand: this.options.onExpand,
            navigationMenuOpened: this.options.navigationMenuOpened,
            onToggleNavigationMenu: this.options.onToggleNavigationMenu,
        }), this.container);
    };

    remove() {
        this.options.diagramView.hideNavigationMenu();
        this.handler.stopListening();
        ReactDOM.unmountComponentAtNode(this.container);
        this.options.paper.el.removeChild(this.container);
    }
}

export interface Props {
    cellView: joint.dia.CellView;
    cellIsExpanded: boolean;
    onDelete: () => void;
    onExpand: () => void;
    navigationMenuOpened?: boolean;
    onToggleNavigationMenu?: () => void;
}

export class HaloMarkup extends React.Component<Props, void> {
    render() {
        const {cellIsExpanded, navigationMenuOpened} = this.props;
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
                (cellIsExpanded ? 'ontodia-halo__expand--closed' : 'ontodia-halo__expand--open')}
                     onClick={this.props.onExpand} />
            </div>
        );
    }
}
