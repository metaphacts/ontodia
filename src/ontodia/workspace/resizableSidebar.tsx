import * as React from 'react';

import { DraggableHandle } from './draggableHandle';

export interface Props {
    className?: string;
    dockSide?: DockSide;
    defaultLength?: number;
    minLength?: number;
    maxLength?: number;
    isOpen?: boolean;
    onOpenOrClose?: (open: boolean) => void;
    onStartResize: () => void;
    children?: React.ReactNode;
}

export enum DockSide {
    Left = 1,
    Right,
    Top,
    Bottom,
}

export interface State {
    readonly open?: boolean;
    readonly length?: number;
}

const CLASS_NAME = 'ontodia-drag-resizable-column';

export class ResizableSidebar extends React.Component<Props, State> {
    static readonly defaultProps: Partial<Props> = {
        dockSide: DockSide.Left,
        minLength: 0,
        maxLength: 500,
        defaultLength: 275,
        isOpen: true,
    };

    private originWidth: number;

    constructor(props: Props) {
        super(props);
        this.state = {
            open: this.props.isOpen,
            length: this.defaultWidth(),
        };
    }

    componentWillReceiveProps(nextProps: Props) {
        if (this.state.open !== nextProps.isOpen) {
            this.toggle({open: nextProps.isOpen});
        }
    }

    private defaultWidth() {
        const {defaultLength, maxLength} = this.props;
        return Math.min(defaultLength, maxLength);
    }

    private getSideClass() {
        switch (this.props.dockSide) {
            case DockSide.Left: return `${CLASS_NAME}--docked-left`;
            case DockSide.Right: return `${CLASS_NAME}--docked-right`;
            case DockSide.Top: return `${CLASS_NAME}--docked-top`;
            case DockSide.Bottom: return `${CLASS_NAME}--docked-bottom`;
            default: return 'docked-right';
        }
    }

    private get isHorizontal(): boolean {
        return this.props.dockSide === DockSide.Top ||
        this.props.dockSide === DockSide.Bottom;
    }

    render() {
        const {open, length} = this.state;

        const className = `${CLASS_NAME} ` +
            `${this.getSideClass()} ` +
            `${CLASS_NAME}--${open ? 'opened' : 'closed'} ` +
            `${this.props.className || ''}`;

        const style: any = {};
        style[this.isHorizontal ? 'height' : 'width'] = open ? length : 0;
        return <div className={className}
            style={style}>
            {open ? this.props.children : null}
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
        this.originWidth = this.state.open ? this.state.length : 0;
        this.props.onStartResize();
    }

    private onDragHandle = (e: MouseEvent, dx: number, dy: number) => {
        let difference = this.isHorizontal ? dy : dx;
        if (this.props.dockSide === DockSide.Right) {
            difference = -difference;
        }
        const newWidth = this.originWidth + difference;
        const clampedWidth = Math.max(Math.min(newWidth, this.props.maxLength), this.props.minLength);
        const isOpen = this.props.minLength > 0 || clampedWidth > this.props.minLength;
        this.toggle({open: isOpen, newWidth: clampedWidth});
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

        const useDefaultWidth = open && this.state.length === 0 && newWidth === undefined;
        if (useDefaultWidth) {
            this.setState({open, length: this.defaultWidth()}, onStateChanged);
        } else {
            this.setState(newWidth === undefined ? {open} : {open, length: newWidth}, onStateChanged);
        }
    }
}
