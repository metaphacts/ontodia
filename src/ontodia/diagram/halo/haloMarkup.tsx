import * as joint from 'jointjs';
import * as React from 'react';

export interface Props {
    cellView: joint.dia.CellView;
    onDelete: () => void;
    onExpand: () => void;
}

export interface State {
    cellIsExpanded: boolean;
}

export class HaloMarkup extends React.Component<Props, State> {

    constructor(props: Props) {
        super(props);
        this.state = {
            cellIsExpanded: this.props.cellView.model.get('isExpanded'),
        };
    }

    public componentDidMount() {
        this.props.cellView.model.on('change:isExpanded', this.setCellIsExpanded);
    }

    public componentWillUnmount() {
        this.props.cellView.model.off('change:isExpanded', this.setCellIsExpanded);
    }

    private setCellIsExpanded = () => {
        this.setState({
            cellIsExpanded: this.props.cellView.model.get('isExpanded'),
        });
    };

    render() {
        let cellIsExpanded = this.state.cellIsExpanded;

        return (
            <div>
                <div className='ontodia-halo__btn ontodia-halo__btn--delete' onClick={this.props.onDelete}/>
                <div className={'ontodia-halo__btn ontodia-halo__btn--expand ' +
                (cellIsExpanded ? 'ontodia-halo__btn--expand-close' : 'ontodia-halo__btn--expand-open')}
                     onClick={this.props.onExpand}/>
            </div>
        );
    }
}
