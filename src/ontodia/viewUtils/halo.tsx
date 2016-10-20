import * as Backbone from 'backbone';
import * as joint from 'jointjs';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import DiagramView from '../diagram/view';

import { ConnectionsMenu } from '../viewUtils/connectionsMenu';

export interface HaloOptions {
    paper: joint.dia.Paper;
    cellView: joint.dia.CellView;
    diagramView: DiagramView;
    onDelete: () => void;
    onExpand: () => void;
}

export class Halo {
    private container: HTMLElement;
    private handler: Backbone.Model;
    private connectionsMenu: ConnectionsMenu;

    constructor(public options: HaloOptions) {
        this.container = document.createElement('div');
        this.options.paper.el.appendChild(this.container);

        this.render();

        this.handler = new Backbone.Model();
        this.handler.listenTo(this.options.cellView.model,
            'change:isExpanded change:position change:size', this.render);
        this.handler.listenTo(this.options.paper, 'scale', this.render);
    }

    private onChangeMenuState = () => {
        if (this.connectionsMenu) {
            this.connectionsMenu.remove();
            this.connectionsMenu = undefined;
        } else {
            this.connectionsMenu = new ConnectionsMenu({
                paper: this.options.diagramView.paper,
                cellView: this.options.cellView,
                onClose: () => {
                    this.connectionsMenu.remove();
                    this.connectionsMenu = undefined;
                    this.render();
                },
                view: this.options.diagramView,
            });
        }
    }

    private render = () => {
        ReactDOM.render(React.createElement(HaloMarkup, {
            cellView: this.options.cellView,
            cellIsExpanded: this.options.cellView.model.get('isExpanded'),
            onDelete: this.options.onDelete,
            onExpand: this.options.onExpand,
            onChangeMenuState: this.onChangeMenuState,
            menuOpened: (this.connectionsMenu ? true : false),
        }), this.container);
    };

    remove() {
        if (this.connectionsMenu) {
            this.connectionsMenu.remove();
            this.connectionsMenu = undefined;
        }
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
    onChangeMenuState: () => void;
    menuOpened?: boolean;
}

export class HaloMarkup extends React.Component<Props, { menuOpened: boolean }> {

    constructor(props: Props) {
        super(props);
        this.state = { menuOpened: this.props.menuOpened || false };
    }

    componentWillReceiveProps(props: Props) {
        this.state = { menuOpened: this.props.menuOpened || false };
    }

    private onChangeMenuState = () => {
        this.setState({ menuOpened: !this.state.menuOpened });
        this.props.onChangeMenuState();
    };

    render() {
        const style = {
            top: this.props.cellView.getBBox().y,
            left: this.props.cellView.getBBox().x,
            height: this.props.cellView.getBBox().height,
            width: this.props.cellView.getBBox().width,
        };
        const cellIsExpanded = this.props.cellIsExpanded;

        return (
            <div className='ontodia-halo' style={style}>
                <div className='ontodia-halo__delete' onClick={this.props.onDelete}/>

                <div className={'ontodia-halo__navigate ' +
                (this.state.menuOpened ? 'ontodia-halo__navigate--closed' : 'ontodia-halo__navigate--open')}
                    onClick={this.onChangeMenuState}/>

                <div className={'ontodia-halo__expand ' +
                (cellIsExpanded ? 'ontodia-halo__expand--closed' : 'ontodia-halo__expand--open')}
                     onClick={this.props.onExpand}/>
            </div>
        );
    }
}
