import * as React from 'react';
import { Component } from 'react';
import * as joint from 'jointjs';

import { Link, linkMarkerKey } from './elements';

export interface PaperProps {
    graph: joint.dia.Graph;
    width: number;
    height: number;
    originX: number;
    originY: number;
    scale: number;
}

interface State {}

export class Paper extends Component<PaperProps, State> {
    render() {
        const {width, height, originX, originY, scale} = this.props;
        return (
            <div>
                <svg width={width} height={height} style={{overflow: 'visible'}}>
                    <g transform={`translate(${originX},${originY})scale(${scale},${scale})`}>
                        {this.renderElements()}
                        {this.renderLinks()}
                    </g>
                </svg>
                {this.props.children}
            </div>
        );
    }

    private renderElements() {
        return this.props.graph.getElements()
            .map(model => <ElementView key={model.id} model={model} />);
    }

    private renderLinks() {
        return this.props.graph.getLinks()
            .map(model => <LinkView key={model.id} model={model as Link} />);
    }
}

class ElementView extends Component<{ model: joint.dia.Element }, {}> {
    componentDidMount() {
        this.props.model.on('change:size', this.onModelChangeSize);
    }

    componentWillUnmount() {
        this.props.model.off('change:size', this.onModelChangeSize);
    }

    private onModelChangeSize = () => {
        this.forceUpdate();
    }

    render() {
        const size = this.props.model.get('size') || {width: 0, height: 0};
        return (
            <g>
                <rect width={size.width} height={size.height} />
            </g>
        );
    }
}

class LinkView extends Component<{ model: Link }, {}> {
    render() {
        const {model} = this.props;
        const typeIndex = model.typeIndex;
        return (
            <g>
                <path className='connection' stroke='black' d='M 0 0 0 0'
                    marker-start={`url(#${linkMarkerKey(typeIndex, true)})`}
                    marker-end={`url(#${linkMarkerKey(typeIndex, false)})`} />
                <path className='connection-wrap' d='M 0 0 0 0' />
                <g className='labels' />
                <g className='marker-vertices' />
                <g className='link-tools' />
            </g>
        );
    }
}
