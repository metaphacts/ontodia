import * as Backbone from 'backbone';
import * as joint from 'jointjs';
import * as React from 'react';
import * as ReactDOM from 'react-dom';

export interface HaloOptions {
    paper: joint.dia.Paper;
    cellView: joint.dia.CellView;
    onDelete: () => void;
    onExpand: () => void;
    onNavigate: () => void;
    connectionsOn?: boolean;
}

export class Halo {
    private container: HTMLElement;
    private handler: Backbone.Model;

    constructor(private options: HaloOptions) {
        this.container = document.createElement('div');
        this.options.paper.el.appendChild(this.container);

        this.render();

        this.handler = new Backbone.Model();
        this.handler.listenTo(this.options.cellView.model,
            'change:isExpanded change:position change:size', this.render);
        this.handler.listenTo(this.options.paper, 'scale', this.render);
    }

    private render = () => {
        ReactDOM.render(React.createElement(HaloMarkup, {
            cellView: this.options.cellView,
            cellIsExpanded: this.options.cellView.model.get('isExpanded'),
            onDelete: this.options.onDelete,
            onExpand: this.options.onExpand,
            onNavigate: this.options.onNavigate,
            connectionsOn: this.options.connectionsOn,
        }), this.container);
    };

    remove() {
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
    onNavigate: () => void;
    connectionsOn?: boolean;
}

export class HaloMarkup extends React.Component<Props, { connectionsOn: boolean }> {

    constructor(props: Props) {
        super(props);
        this.state = { connectionsOn: this.props.connectionsOn || false };
    }

    private onNavigate = () => {
        this.setState({ connectionsOn: !this.state.connectionsOn });
        this.props.onNavigate();
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
                (this.state.connectionsOn ? 'ontodia-halo__navigate--closed' : 'ontodia-halo__navigate--open')}
                    onClick={this.onNavigate}/>

                <div className={'ontodia-halo__expand ' +
                (cellIsExpanded ? 'ontodia-halo__expand--closed' : 'ontodia-halo__expand--open')}
                     onClick={this.props.onExpand}/>
            </div>
        );
    }
}
