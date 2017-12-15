import * as React from 'react';

import { DiagramView } from './view';
import { Paper } from './paper';
import { Element } from './elements';
import { ElementLayer } from './elementLayer';

export interface Props {
    view: DiagramView;
    element: Element;
}

export class EmbeddedLayer extends React.Component<Props, void> {
    componentDidMount() {
        const {view, element} = this.props;
        const {id, template} = element;

        view.loadEmbeddedElements(id, template.id).then(res => {
            const elements = Object.keys(res).map(key => view.model.createElement(res[key]));
            view.model.requestElementData(elements);
            view.model.requestLinksOfType();
            this.updateAll();
        });
    }

    private updateAll = () => this.forceUpdate();

    private onLayerInit = (container: HTMLDivElement) => {
        if (!container) { return; }

        const {element} = this.props;
        element.set('paper-position', {x: container.offsetLeft, y: container.offsetTop});
    }

    render() {
        const {view, element} = this.props;

        const style = {
            position: 'absolute', left: 0, top: 0,
        };

        return (
            <div className="ontodia-embedded-layer" ref={this.onLayerInit}>
                <Paper view={view}
                       width={400}
                       height={400}
                       originX={0}
                       originY={0}
                       scale={1}
                       paddingX={0}
                       paddingY={0}
                       onPointerDown={() => {}}
                       group={element.id}>
                    <ElementLayer view={view} group={element.id} style={style} />
                </Paper>
            </div>
        );
    }
}
