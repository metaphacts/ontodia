import * as React from 'react';

import { Accordion } from '../accordion';
import { AccordionItem, DockSide } from '../accordionItem';

const DEFAULT_HORIZONTAL_COLLAPSED_SIZE = 28;

export enum WorkspaceLayoutType {
    Row = 'row',
    Column = 'column',
    Component = 'component',
}

export type WorkspaceLayoutNode = Container | Component;

interface Container {
    type: WorkspaceLayoutType.Row | WorkspaceLayoutType.Column;
    children: ReadonlyArray<WorkspaceLayoutNode>;
    defaultSize?: number;
    defaultCollapsed?: boolean;
    collapsedSize?: number;
    minSize?: number;
    undocked?: boolean;
    animationDuration?: number;
}

interface Component {
    id: string;
    type: WorkspaceLayoutType.Component;
    content: React.ReactElement<any>;
    heading?: React.ReactNode;
    defaultSize?: number;
    defaultCollapsed?: boolean;
    collapsedSize?: number;
    minSize?: number;
    undocked?: boolean;
}

export interface WorkspaceLayoutProps {
    layout: WorkspaceLayoutNode;
    _onStartResize?: (direction: 'vertical' | 'horizontal') => void;
    _onResize?: (direction: 'vertical' | 'horizontal') => void;
}

export class WorkspaceLayout extends React.Component<WorkspaceLayoutProps, {}> {
    private renderAccordion({children, direction, animationDuration}: {
        children: ReadonlyArray<WorkspaceLayoutNode>;
        direction: 'horizontal' | 'vertical';
        animationDuration?: number;
    }) {
        const {_onStartResize, _onResize} = this.props;
        const items = children.map((child, index) => {
            let dockSide: DockSide;
            if (direction === 'horizontal' && !child.undocked) {
                if (index === 0) {
                    dockSide = DockSide.Left;
                } else if (index === children.length - 1) {
                    dockSide = DockSide.Right;
                }
            }
            let collapsedSize = child.collapsedSize;
            if (collapsedSize === undefined && direction === 'horizontal') {
                collapsedSize = DEFAULT_HORIZONTAL_COLLAPSED_SIZE;
            }
            return (
                <AccordionItem key={child.type === WorkspaceLayoutType.Component ? child.id : index}
                    heading={child.type === WorkspaceLayoutType.Component ? child.heading : undefined}
                    dockSide={dockSide}
                    defaultSize={child.defaultSize}
                    defaultCollapsed={child.defaultCollapsed}
                    collapsedSize={collapsedSize}
                    minSize={child.minSize}>
                    {this.renderLayout(child)}
                </AccordionItem>
            );
        });
        return (
            <Accordion direction={direction}
                onStartResize={_onStartResize}
                onResize={_onResize}
                animationDuration={animationDuration}>
                {items}
            </Accordion>
        );
    }

    private renderLayout(layout: WorkspaceLayoutNode) {
        if (layout.type === WorkspaceLayoutType.Row) {
            return this.renderAccordion({
                children: layout.children,
                direction: 'horizontal',
                animationDuration: layout.animationDuration,
            });
        }
        if (layout.type === WorkspaceLayoutType.Column) {
            return this.renderAccordion({
                children: layout.children,
                direction: 'vertical',
                animationDuration: layout.animationDuration,
            });
        }
        if (layout.type === WorkspaceLayoutType.Component) {
            return React.Children.only(layout.content);
        }
        return null;
    }

    render() {
        const {layout} = this.props;
        return this.renderLayout(layout);
    }
}
