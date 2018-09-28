import * as React from 'react';

import { AccordionItem, Props as ItemProps } from './accordionItem';

export interface Props {
    onStartResize?: () => void;
    /** AccordionItem[] */
    children?: React.ReactElement<ItemProps> | ReadonlyArray<React.ReactElement<ItemProps>>;
}

export interface State {
    readonly height?: number;
    /**
     * Items' sizes in pixels.
     * Undefined until first resize or toggle initiated by user.
     */
    readonly sizes?: number[];
    /**
     * Items' sizes in percent.
     */
    readonly percents?: string[];
    /**
     * Per-item collapsed state: true if corresponding item is collapsed;
     * otherwise false.
     */
    readonly collapsed?: boolean[];
    readonly resizing?: boolean;
}

const CLASS_NAME = 'ontodia-accordion';

export class Accordion extends React.Component<Props, State> {
    private element: HTMLDivElement;

    private items: AccordionItem[] = [];
    private originSizes: ReadonlyArray<number>;
    private originCollapsed: ReadonlyArray<boolean>;
    private originTotalHeight: number;

    constructor(props: Props) {
        super(props);
        const childCount = React.Children.count(this.props.children);
        this.state = {
            height: 0,
            collapsed: React.Children.map(this.props.children, () => false),
            resizing: false,
            percents: React.Children.map(this.props.children, () => `${100 / childCount}%`),
        };
    }

    componentDidMount() {
        window.addEventListener('resize', this.setHeight);
        this.setHeight();
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.setHeight);
    }

    private setHeight = () => {
        this.setState({height: this.element.parentElement.clientHeight});
    }

    render() {
        const {resizing, height} = this.state;
        return (
            <div className={`${CLASS_NAME} ${resizing ? `${CLASS_NAME}--resizing` : ''}`}
                ref={element => this.element = element} style={{height}}>
                {this.renderItems()}
            </div>
        );
    }

    private renderItems() {
        const {sizes, percents, collapsed} = this.state;
        const {children} = this.props;

        return React.Children.map(children, (child, index) => {
            if (typeof child !== 'object') {
                throw new Error('Accordion should have only AccordionItem elements as children');
            }
            const lastChild = index === React.Children.count(children) - 1;
            const height = collapsed[index] ? sizes[index] : percents[index];

            const additionalProps: Partial<ItemProps> & React.Props<AccordionItem> = {
                ref: element => this.items[index] = element,
                collapsed: collapsed[index],
                height,
                onChangeCollapsed: newState => this.onItemChangeCollapsed(index, newState),
                onBeginDragHandle: lastChild ? undefined : () => this.onBeginDragHandle(index),
                onDragHandle: lastChild ? undefined : (dx, dy) => this.onDragHandle(index, dx, dy),
                onEndDragHandle: this.onEndDragHandle,
            };
            return React.cloneElement(child, additionalProps);
        });
    }

    private onBeginDragHandle = (itemIndex: number) => {
        this.originTotalHeight = this.element.clientHeight;
        this.originSizes = this.computeEffectiveItemHeights();
        this.originCollapsed = [...this.state.collapsed];
        this.setState({resizing: true}, () => {
            if (this.props.onStartResize) {
                this.props.onStartResize();
            }
        });
    }

    private onEndDragHandle = () => {
        this.setState({resizing: false});
    }

    private computeEffectiveItemHeights(): number[] {
        return this.items.map((item, index) => {
            if (this.state.collapsed[index]) {
                return item.header.clientHeight;
            } else {
                return item.element.offsetHeight;
            }
        });
    }

    private sizeWhenCollapsed = (index: number) => {
        const item = this.items[index];
        return item.header.clientHeight + (item.element.offsetHeight - item.element.clientHeight);
    }

    private onDragHandle = (itemIndex: number, dx: number, dy: number) => {
        const sizes = [...this.originSizes];
        const collapsed = [...this.originCollapsed];

        new SizeDistributor(
            sizes, collapsed, this.originTotalHeight, this.sizeWhenCollapsed,
        ).distribute(itemIndex + 1, dy);

        const percents = sizes.map(size => `${100 * size / this.state.height}%`);

        this.setState({sizes, percents, collapsed});
    }

    private onItemChangeCollapsed(itemIndex: number, itemCollapsed: boolean) {
        const totalHeight = this.element.clientHeight;
        const sizes = this.computeEffectiveItemHeights();
        const collapsed = [...this.state.collapsed];

        const effectiveSize = sizes[itemIndex];

        const collapsedSize = this.sizeWhenCollapsed(itemIndex);
        const distributor = new SizeDistributor(
            sizes, collapsed, totalHeight, this.sizeWhenCollapsed);

        if (itemCollapsed) {
            const splitShift = Math.max(effectiveSize - collapsedSize, 0);
            sizes[itemIndex] = collapsedSize;
            if (itemIndex === sizes.length - 1) {
                distributor.expand(splitShift, 0, itemIndex);
            } else {
                distributor.expand(splitShift, itemIndex + 1, sizes.length);
            }
        } else {
            const shift = (totalHeight / sizes.length) - collapsedSize;
            let freeSize = distributor.collapse(shift, itemIndex + 1, sizes.length);
            freeSize = Math.max(freeSize, distributor.leftoverSize());
            if (freeSize < shift) {
                freeSize += distributor.collapse(shift - freeSize, 0, itemIndex);
            }
            const newSize = Math.round(collapsedSize + freeSize);
            sizes[itemIndex] = newSize;
        }

        collapsed[itemIndex] = itemCollapsed;

        const percents = sizes.map(size => `${100 * size / this.state.height}%`);

        this.setState({sizes, percents, collapsed});
    }
}

class SizeDistributor {
    constructor(
        readonly sizes: number[],
        readonly collapsed: boolean[],
        readonly totalSize: number,
        readonly sizeWhenCollapsed: (index: number) => number,
    ) {}

    distribute(splitIndex: number, splitShift: number) {
        if (splitShift > 0) {
            let freeSize = this.collapse(splitShift, splitIndex, this.sizes.length);
            freeSize = Math.max(freeSize, this.leftoverSize());
            this.expand(freeSize, 0, splitIndex);
        } else {
            let freeSize = this.collapse(-splitShift, 0, splitIndex);
            freeSize = Math.max(freeSize, this.leftoverSize());
            this.expand(freeSize, splitIndex, this.sizes.length);
        }
    }

    collapse(shift: number, from: number, to: number) {
        if (shift <= 0) { return 0; }
        let shiftLeft = shift;
        for (let i = to - 1; i >= from; i--) {
            if (this.collapsed[i]) { continue; }
            const size = this.sizes[i];
            const collapsedSize = this.sizeWhenCollapsed(i);
            const newSize = Math.round(Math.max(size - shiftLeft, collapsedSize));
            shiftLeft = shiftLeft - (size - newSize);
            this.sizes[i] = newSize;
            this.collapsed[i] = newSize <= collapsedSize;
        }
        return shift - shiftLeft;
    }

    expand(shift: number, from: number, to: number) {
        if (shift <= 0) { return 0; }
        const firstOpenFromEnd = this.collapsed.lastIndexOf(false, to - 1);
        const index = (firstOpenFromEnd >= from) ? firstOpenFromEnd : (to - 1);
        const oldSize = this.sizes[index];
        const newSize = Math.round(oldSize + shift);
        this.sizes[index] = newSize;
        this.collapsed[index] = newSize <= this.sizeWhenCollapsed(index);
        return newSize - oldSize;
    }

    leftoverSize() {
        const sizeSum = this.sizes.reduce((sum, size) => sum + size, 0);
        return Math.max(this.totalSize - sizeSum, 0);
    }
}
