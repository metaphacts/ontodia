import * as React from 'react';

export interface Props extends React.HTMLAttributes<HTMLDivElement> {
    onBeginDragHandle: (e: React.MouseEvent<HTMLDivElement>) => void;
    onDragHandle: (e: MouseEvent, dx: number, dy: number) => void;
    onEndDragHandle?: (e: MouseEvent) => void;
}

export class DraggableHandle extends React.Component<Props, {}> {
    private isHoldingMouse = false;
    private originPageX: number;
    private originPageY: number;

    render() {
        // remove custom handlers from `div` props
        // tslint:disable-next-line:no-unused-variable
        const {onBeginDragHandle, onDragHandle, onEndDragHandle, ...props} = this.props;
        return <div {...props} onMouseDown={this.onHandleMouseDown}>
            {this.props.children}
        </div>;
    }

    componentWillUnmount() {
        this.removeListeners();
    }

    private onHandleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target !== e.currentTarget) { return; }
        if (this.isHoldingMouse) { return; }

        const LEFT_BUTTON = 0;
        if (e.button !== LEFT_BUTTON) { return; }

        this.isHoldingMouse = true;
        this.originPageX = e.pageX;
        this.originPageY = e.pageY;
        document.addEventListener('mousemove', this.onMouseMove);
        document.addEventListener('mouseup', this.onMouseUp);
        this.props.onBeginDragHandle(e);
    }

    private onMouseMove = (e: MouseEvent) => {
        if (!this.isHoldingMouse) { return; }
        e.preventDefault();
        this.props.onDragHandle(e, e.pageX - this.originPageX, e.pageY - this.originPageY);
    }

    private onMouseUp = (e: MouseEvent) => {
        this.removeListeners();
        if (this.props.onEndDragHandle) {
            this.props.onEndDragHandle(e);
        }
    }

    private removeListeners() {
        if (this.isHoldingMouse) {
            this.isHoldingMouse = false;
            document.removeEventListener('mousemove', this.onMouseMove);
            document.removeEventListener('mouseup', this.onMouseUp);
        }
    }
}
