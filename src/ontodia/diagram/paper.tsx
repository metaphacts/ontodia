import * as React from 'react';
import { Component, SVGAttributes, CSSProperties } from 'react';

import { Cell, Element as DiagramElement, Link as DiagramLink, LinkVertex } from './elements';
import { Vector } from './geometry';
import { LinkLayer, LinkMarkers } from './linkLayer';
import { DiagramModel } from './model';
import { DiagramView } from './view';

export interface PaperProps {
    view: DiagramView;
    width: number;
    height: number;
    originX: number;
    originY: number;
    scale: number;
    paddingX: number;
    paddingY: number;
    onPointerDown?: (e: React.MouseEvent<HTMLElement>, cell: Cell | undefined) => void;
    group?: string;
}

const CLASS_NAME = 'ontodia-paper';

export class Paper extends Component<PaperProps, {}> {
    render() {
        const {width, height, originX, originY, scale, paddingX, paddingY} = this.props;
        const scaledWidth = width * scale;
        const scaledHeight = height * scale;
        // using padding instead of margin in combination with setting width and height
        // on .paper element to avoid "over-constrained" margins, see an explanation here:
        // https://stackoverflow.com/questions/11695354
        const style: CSSProperties = {
            width: scaledWidth + paddingX,
            height: scaledHeight + paddingY,
            marginLeft: paddingX,
            marginTop: paddingY,
            paddingRight: paddingX,
            paddingBottom: paddingY,
        };
        return (
            <div className={CLASS_NAME} style={style} onMouseDown={this.onMouseDown}>
                <svg className={`${CLASS_NAME}__canvas`}
                    width={scaledWidth} height={scaledHeight}
                    style={{overflow: 'visible'}}>
                    <LinkMarkers view={this.props.view} />
                    <g transform={`scale(${scale},${scale})translate(${originX},${originY})`}>
                        <LinkLayer view={this.props.view} group={this.props.group} />
                    </g>
                </svg>
                {this.props.children}
            </div>
        );
    }

    private onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        const {view, onPointerDown} = this.props;
        const cell = e.target instanceof Element
            ? findCell(e.target, e.currentTarget, view.model) : undefined;
        if (onPointerDown) {
            onPointerDown(e, cell);
        }
    }
}

function findCell(bottom: Element, top: Element, model: DiagramModel): Cell | undefined {
    let target: Node = bottom;
    let vertexIndex: number | undefined = undefined;
    while (true) {
        if (target instanceof Element) {
            if (target.hasAttribute('data-element-id')) {
                return model.getElement(target.getAttribute('data-element-id'));
            } else if (target.hasAttribute('data-link-id')) {
                const link = model.getLinkById(target.getAttribute('data-link-id'));
                return typeof vertexIndex === 'number' ? new LinkVertex(link, vertexIndex) : link;
            } else if (target.hasAttribute('data-vertex')) {
                vertexIndex = Number(target.getAttribute('data-vertex'));
            }
        }
        if (!target || target === top) { break; }
        target = target.parentNode;
    }
    return undefined;
}
