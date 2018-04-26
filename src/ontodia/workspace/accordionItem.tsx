import * as React from 'react';

import { DraggableHandle } from './draggableHandle';
import { TutorialProps } from './tutorial';

export interface Props {
    heading: string;
    bodyClassName?: string;
    bodyRef?: (body: HTMLDivElement) => void;
    tutorialProps?: TutorialProps;
    children?: React.ReactNode;

    // props provided by Accordion
    collapsed?: boolean;
    height?: number | string;
    onChangeCollapsed?: (collapsed: boolean) => void;
    onBeginDragHandle?: () => void;
    onDragHandle?: (dx: number, dy: number) => void;
    onEndDragHandle?: () => void;
}

const CLASS_NAME = 'ontodia-accordion-item';

export class AccordionItem extends React.Component<Props, {}> {
    private _element: HTMLDivElement;
    private _header: HTMLDivElement;

    get element() { return this._element; }
    get header() { return this._header; }

    render() {
        const {
            heading, bodyClassName, children, tutorialProps, bodyRef,
            collapsed, height, onBeginDragHandle, onDragHandle, onEndDragHandle,
        } = this.props;
        const shouldRenderHandle = onBeginDragHandle && onDragHandle && onEndDragHandle;

        return <div className={`${CLASS_NAME} ${CLASS_NAME}--${collapsed ? 'collapsed' : 'expanded'}`}
            ref={element => this._element = element}
            style={{height}}
            {...tutorialProps}>
            <div className={`${CLASS_NAME}__inner`}>
                <div className={`${CLASS_NAME}__header`}
                    ref={header => this._header = header}
                    onClick={() => this.props.onChangeCollapsed(!collapsed)}>{heading}</div>
                <div className={`${CLASS_NAME}__body`}>
                    {children ? children :
                        <div ref={bodyRef} className={`${bodyClassName || ''}`} />}
                </div>
            </div>
            {shouldRenderHandle ? <DraggableHandle className={`${CLASS_NAME}__handle`}
                onBeginDragHandle={e => onBeginDragHandle()}
                onDragHandle={(e, x, y) => onDragHandle(x, y)}
                onEndDragHandle={e => onEndDragHandle()} /> : null}
        </div>;
    }
}
