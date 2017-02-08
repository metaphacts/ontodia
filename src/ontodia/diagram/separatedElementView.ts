import * as joint from 'jointjs';

import { Element } from './elements';
import { DiagramView } from './view';

const DEBUG_BOUNDS = false;

export class SeparatedElementView extends joint.dia.ElementView {
    model: Element;

    paper?: { diagramView?: DiagramView };
    private view: DiagramView;

    private rect: SVGRectElement;

    render() {
        const result = super.render();
        if (!this.view && this.paper && this.paper.diagramView) {
            this.setView(this.paper.diagramView);
        }

        this.rect = (this.el as SVGElement).querySelector('.rootOfUI') as SVGRectElement;
        this.rect.setAttribute('cursor', 'pointer');
        if (DEBUG_BOUNDS) {
            this.rect.style.fill = 'green';
            this.rect.style.stroke = 'red';
            this.rect.style.strokeWidth = '3';
        }

        this.updateSize();
        return result;
    }

    private setView(view: DiagramView) {
        this.view = view;
        this.listenTo(this.model, 'change:size', this.updateSize);
    }

    private updateSize = () => {
        const size = this.model.get('size') || {width: 0, height: 0};
        this.rect.setAttribute('width', size.width || 0);
        this.rect.setAttribute('height', size.height || 0);
    }
}
