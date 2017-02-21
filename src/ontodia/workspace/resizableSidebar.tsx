import * as React from 'react';

import { TutorialProps } from '../tutorial/tutorial';

import { DraggableHandle } from './draggableHandle';

export interface Props {
    className?: string;
    dockSide?: DockSide;
    defaultWidth?: number;
    minWidth?: number;
    maxWidth?: number;
    initiallyOpen?: boolean;
    onOpenOrClose?: (open: boolean) => void;
    onStartResize: () => void;
    tutorialProps?: TutorialProps;
    children?: React.ReactNode;
}

export enum DockSide {
    Left = 1,
    Right,
}

export interface State {
    readonly open?: boolean;
    readonly width?: number;
}

const CLASS_NAME = 'ontodia-drag-resizable-column';

export class ResizableSidebar extends React.Component<Props, State> {
    static readonly defaultProps: Partial<Props> = {
        dockSide: DockSide.Left,
        minWidth: 0,
        maxWidth: 500,
        defaultWidth: 275,
        initiallyOpen: true,
    };

    private originWidth: number;

    constructor(props: Props) {
        super(props);
        const {initiallyOpen} = this.props;
        this.state = {
            open: initiallyOpen,
            width: this.defaultWidth(),
        };
    }

    private defaultWidth() {
        const {defaultWidth, maxWidth} = this.props;
        return Math.min(defaultWidth, maxWidth);
    }

    render() {
        const isDockedLeft = this.props.dockSide === DockSide.Left;
        const {open, width} = this.state;

        const className = `${CLASS_NAME} ` +
            `${CLASS_NAME}--${isDockedLeft ? 'docked-left' : 'docked-right'} ` +
            `${CLASS_NAME}--${open ? 'opened' : 'closed'} ` +
            `${this.props.className || ''}`;

        return <div className={className}
            style={{width: open ? width : 0}}
            {...this.props.tutorialProps}>
            {this.props.children}
            <DraggableHandle className={`${CLASS_NAME}__handle`}
                onBeginDragHandle={this.onBeginDragHandle}
                onDragHandle={this.onDragHandle}>
                <div className={`${CLASS_NAME}__handle-btn`}
                    onClick={() => this.toggle({open: !this.state.open})}>
                </div>
            </DraggableHandle>
        </div>;
    }

    private onBeginDragHandle = () => {
        this.originWidth = this.state.open ? this.state.width : 0;
        this.props.onStartResize();
    }

    private onDragHandle = (e: MouseEvent, dx: number, dy: number) => {
        let xDifference = dx;
        if (this.props.dockSide === DockSide.Right) {
            xDifference = -xDifference;
        }
        const newWidth = this.originWidth + xDifference;
        const clampedWidth = Math.max(Math.min(newWidth, this.props.maxWidth), this.props.minWidth);
        this.toggle({open: clampedWidth > this.props.minWidth, newWidth: clampedWidth});
    }

    private toggle(params: {
        open: boolean;
        newWidth?: number;
    }) {
        const {open, newWidth} = params;
        const openChanged = open !== this.state.open;
        const onStateChanged = () => {
            if (openChanged && this.props.onOpenOrClose) {
                this.props.onOpenOrClose(open);
            }
        };

        const useDefaultWidth = open && this.state.width === 0 && newWidth === undefined;
        if (useDefaultWidth) {
            this.setState({open, width: this.defaultWidth()}, onStateChanged);
        } else {
            this.setState(newWidth === undefined ? {open} : {open, width: newWidth}, onStateChanged);
        }
    }
}
