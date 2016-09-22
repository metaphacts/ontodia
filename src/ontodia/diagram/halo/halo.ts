import * as joint from 'jointjs';
import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { HaloMarkup } from './haloMarkup';

export interface HaloOptions {
    paper: joint.dia.Paper;
    cellView: joint.dia.CellView;
    onDelete: () => void;
    onExpand: () => void;
}

export class Halo {
    private container: HTMLElement;

    constructor(private options: HaloOptions) {
        this.render();

        this.options.cellView.model.on('change:position', () => this.update());
        this.options.cellView.model.on('change:isExpanded', () => this.update());
        this.options.paper.on('scale', () => this.update());
    }

    private render() {
        this.container = document.createElement('div');
        this.container.className = 'ontodia-halo';
        this.options.paper.el.appendChild(this.container);

        this.update();

        ReactDOM.render(React.createElement(HaloMarkup, {
            cellView: this.options.cellView,
            onDelete: this.options.onDelete,
            onExpand: this.options.onExpand,
        }), this.container);
    }

    private update() {
        this.container.style.top = this.options.cellView.getBBox().y + 'px';
        this.container.style.left = this.options.cellView.getBBox().x + 'px';
        this.container.style.width = this.options.cellView.getBBox().width + 'px';
        this.container.style.height = this.options.cellView.getBBox().height + 'px';
    }

    remove() {
        this.options.cellView.model.off('change:position', () => this.update());
        this.options.cellView.model.off('change:isExpanded', () => this.update());
        this.options.paper.off('scale', () => this.update());

        ReactDOM.unmountComponentAtNode(this.container);
        this.options.paper.el.removeChild(this.container);
    }
}
